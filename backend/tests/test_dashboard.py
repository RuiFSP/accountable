from datetime import date, datetime, timedelta

import pytest
from app import db, stats
from sqlalchemy import create_engine, select

# Fixed "today" so every figure in the fixture is deterministic.
TODAY = date(2026, 6, 15)


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'dashboard.db'}")
    db.metadata.create_all(test_engine)

    with test_engine.begin() as connection:
        organization_id = db.inserted_id(
            connection.execute(
                db.organizations.insert().values(
                    name="Fixture Org", website=None, industry=None, notes=None
                )
            )
        )
        contact_id = db.inserted_id(
            connection.execute(
                db.contacts.insert().values(
                    name="Fixture Contact",
                    email=None,
                    phone=None,
                    job_title=None,
                    organization_id=organization_id,
                    status="lead",
                )
            )
        )

        def deal(name, stage, value_cents, probability, close_date):
            connection.execute(
                db.deals.insert().values(
                    name=name,
                    organization_id=organization_id,
                    contact_id=contact_id,
                    stage=stage,
                    value_cents=value_cents,
                    probability=probability,
                    close_date=close_date,
                    position=0,
                )
            )

        def activity(
            description, happened_at, follow_up_date=None, done=False, kind="note"
        ):
            connection.execute(
                db.activities.insert().values(
                    type=kind,
                    contact_id=contact_id,
                    deal_id=None,
                    description=description,
                    happened_at=happened_at,
                    follow_up_date=follow_up_date,
                    done=done,
                )
            )

        # Won inside the window: current month and eleven months back; one too old.
        deal("Won this month", "Won", 100_000, 100, date(2026, 6, 10))
        deal("Won last July", "Won", 200_000, 100, date(2025, 7, 20))
        deal("Won too long ago", "Won", 900_000, 100, date(2025, 5, 20))
        # Lost never counts as won.
        deal("Lost one", "Lost", 50_000, 0, date(2026, 1, 10))
        # Open deals: pipeline and expected revenue.
        deal("Open New", "New", 100_000, 10, date(2026, 8, 1))
        deal("Open Proposal", "Proposal", 99_999, 50, date(2026, 7, 1))

        def invoice(status, total_cents, due_date):
            """A deal won before the chart window, with one invoice on it."""
            invoiced_deal = db.inserted_id(
                connection.execute(
                    db.deals.insert().values(
                        name="Invoiced work",
                        organization_id=organization_id,
                        contact_id=contact_id,
                        stage="Won",
                        value_cents=total_cents,
                        probability=100,
                        close_date=date(2025, 5, 15),
                        position=0,
                    )
                )
            )
            return db.inserted_id(
                connection.execute(
                    db.invoices.insert().values(
                        deal_id=invoiced_deal,
                        organization_id=organization_id,
                        status=status,
                        issue_date=date(2025, 5, 20),
                        due_date=due_date,
                        subtotal_cents=total_cents,
                        tax_label="Sales tax",
                        tax_rate_thousandths=0,
                        tax_cents=0,
                        total_cents=total_cents,
                    )
                )
            )

        def payment(invoice_id, amount_cents, paid_on):
            connection.execute(
                db.payments.insert().values(
                    invoice_id=invoice_id,
                    paid_on=paid_on,
                    amount_cents=amount_cents,
                    method="bank_transfer",
                    reference=None,
                    created_by=None,
                )
            )

        # Ten days late with part of it paid: still owed, in the 1 to 30 bucket.
        part_paid = invoice("issued", 100_000, date(2026, 6, 5))
        # Due after today: owed but not yet due.
        invoice("issued", 50_000, date(2026, 6, 20))
        # Due today and not yet paid: owed, and not yet due.
        invoice("issued", 30_000, date(2026, 6, 15))
        # Long past due, with a payment from outside the payments window.
        past_due = invoice("issued", 70_000, date(2025, 8, 1))
        # Drafts and void invoices are not owed.
        invoice("draft", 900_000, date(2026, 6, 1))
        invoice("void", 800_000, date(2026, 6, 1))

        payment(part_paid, 60_000, date(2026, 6, 10))
        payment(past_due, 10_000, date(2025, 6, 1))
        # Settled last month: the payment counts, the balance does not.
        settled = invoice("issued", 30_000, date(2026, 6, 30))
        payment(settled, 30_000, date(2026, 5, 2))

        activity("Oldest note", datetime(2026, 6, 12, 9, 0))
        activity("Middle note", datetime(2026, 6, 13, 9, 0))
        activity("Stage moved", datetime(2026, 6, 14, 9, 0), kind="stage_change")
        activity("Newest note", datetime(2026, 6, 15, 8, 0))
        activity(
            "Overdue call",
            datetime(2026, 6, 10, 9, 0),
            follow_up_date=TODAY - timedelta(days=2),
        )
        activity(
            "Upcoming email",
            datetime(2026, 6, 11, 9, 0),
            follow_up_date=TODAY + timedelta(days=3),
        )
        activity(
            "Already done",
            datetime(2026, 6, 9, 9, 0),
            follow_up_date=TODAY - timedelta(days=1),
            done=True,
        )
        activity("No follow-up", datetime(2026, 6, 8, 9, 0))

    yield test_engine
    test_engine.dispose()


@pytest.fixture()
def conn(engine):
    with engine.connect() as connection:
        yield connection


def test_won_revenue_is_bucketed_into_the_last_12_months(conn):
    won = stats.won_summary(conn, TODAY)

    assert len(won["months"]) == 12
    assert won["months"][0]["month"] == "2025-07"  # window opens11 months back
    assert won["months"][-1]["month"] == "2026-06"

    by_month = {month["month"]: month for month in won["months"]}
    assert by_month["2026-06"] == {
        "month": "2026-06",
        "revenue_cents": 100_000,
        "deals": 1,
    }
    assert by_month["2025-07"] == {
        "month": "2025-07",
        "revenue_cents": 200_000,
        "deals": 1,
    }
    assert by_month["2025-12"] == {"month": "2025-12", "revenue_cents": 0, "deals": 0}

    assert won["total_revenue_cents"] == 300_000  # the too-old win excluded
    assert won["total_deals"] == 2


def test_a_won_deal_with_a_future_close_date_still_counts(conn):
    # Winning before the expected close date used to hide the deal from every
    # figure: it left the pipeline as Won and never entered the won buckets.
    organization_id = conn.execute(select(db.organizations.c.id)).scalar_one()
    contact_id = conn.execute(select(db.contacts.c.id)).scalar_one()

    def won_early(name, close_date, value_cents):
        conn.execute(
            db.deals.insert().values(
                name=name,
                organization_id=organization_id,
                contact_id=contact_id,
                stage="Won",
                value_cents=value_cents,
                probability=100,
                close_date=close_date,
                position=0,
            )
        )

    won_early("Won this month, ahead of time", TODAY + timedelta(days=13), 400_000)
    won_early("Won far ahead", date(2026, 8, 1), 600_000)

    won = stats.won_summary(conn, TODAY)
    by_month = {month["month"]: month for month in won["months"]}

    # Both land in the current month, capped at today.
    assert by_month["2026-06"] == {
        "month": "2026-06",
        "revenue_cents": 1_100_000,
        "deals": 3,
    }
    assert won["total_revenue_cents"] == 1_300_000  # the300_000 already in the fixture
    assert won["total_deals"] == 4


def test_pipeline_totals_count_open_deals_only(conn):
    pipeline = stats.pipeline_totals(conn)

    assert pipeline["value_cents"] == 199_999  # won and lost excluded
    assert pipeline["count"] == 2
    assert pipeline["expected_cents"] == (100_000 * 10 // 100) + (99_999 * 50 // 100)


def test_funnel_shows_each_open_stage_plus_won_and_lost(conn):
    funnel = stats.funnel(conn, TODAY)

    by_stage = {row["stage"]: row for row in funnel["stages"]}
    assert set(by_stage) == {"New", "Qualified", "Proposal", "Negotiation"}
    assert by_stage["New"] == {
        "stage": "New",
        "count": 1,
        "value_cents": 100_000,
        "expected_cents": 10_000,
    }
    assert by_stage["Proposal"]["value_cents"] == 99_999
    assert by_stage["Qualified"] == {
        "stage": "Qualified",
        "count": 0,
        "value_cents": 0,
        "expected_cents": 0,
    }

    assert funnel["won_12m_cents"] == 300_000
    assert funnel["won_12m_count"] == 2
    assert funnel["lost_cents"] == 50_000
    assert funnel["lost_count"] == 1


def test_recent_activity_is_newest_first_and_includes_stage_changes(conn):
    recent = stats.recent_activity(conn)

    descriptions = [row["description"] for row in recent]
    assert descriptions[:4] == [
        "Newest note",
        "Stage moved",
        "Middle note",
        "Oldest note",
    ]
    assert "Stage moved" in descriptions
    assert all(
        row["type"] == "stage_change"
        for row in recent
        if row["description"] == "Stage moved"
    )
    assert len(recent) <= stats.RECENT_ACTIVITY_LIMIT


def test_follow_ups_split_into_overdue_and_upcoming(conn):
    follow_ups = stats.follow_ups(conn, TODAY)

    assert [row["description"] for row in follow_ups["overdue"]] == ["Overdue call"]
    assert [row["description"] for row in follow_ups["upcoming"]] == ["Upcoming email"]
    assert follow_ups["overdue_count"] == 1
    assert follow_ups["open_count"] == 2  # done and follow-up-less activities excluded


def test_money_owes_issued_balances_only(conn):
    money = stats.money_summary(conn, TODAY)

    # 40,000 part paid + 50,000 not yet due + 30,000 due today + 60,000 old.
    assert money["owed_cents"] == 180_000
    # The due-today invoice is not overdue; the draft and the void one owe nothing.
    assert money["overdue_cents"] == 100_000


def test_the_five_aging_buckets_match_the_invoices_behind_them(conn):
    money = stats.money_summary(conn, TODAY)

    assert money["aging"] == [
        {"bucket": "not yet due", "cents": 80_000},  # 50,000 ahead, 30,000 today
        {"bucket": "1 to 30", "cents": 40_000},
        {"bucket": "31 to 60", "cents": 0},
        {"bucket": "61 to 90", "cents": 0},
        {"bucket": "over 90", "cents": 60_000},
    ]
    # Every overdue cent sits in one of the four buckets past due.
    assert money["overdue_cents"] == sum(row["cents"] for row in money["aging"][1:])
    assert money["owed_cents"] == sum(row["cents"] for row in money["aging"])


def test_payments_per_month_match_their_own_dates(conn):
    money = stats.money_summary(conn, TODAY)
    payments = money["payments"]

    assert len(payments) == 12
    assert payments[0]["month"] == "2025-07"
    assert payments[-1] == {"month": "2026-06", "cents": 60_000}
    by_month = {row["month"]: row["cents"] for row in payments}
    assert by_month["2026-05"] == 30_000
    assert by_month["2025-12"] == 0
    assert "2025-06" not in by_month  # older than the window the chart shows


def test_dashboard_payload_holds_every_figure(conn):
    payload = stats.dashboard_payload(conn, TODAY)

    assert set(payload) == {
        "won",
        "pipeline",
        "funnel",
        "money",
        "recent_activity",
        "follow_ups",
    }
    assert payload["won"]["total_revenue_cents"] == 300_000
    assert payload["pipeline"]["count"] == 2
    assert payload["follow_ups"]["overdue_count"] == 1
    assert payload["recent_activity"][0]["description"] == "Newest note"
    assert payload["money"]["owed_cents"] == 180_000


def test_dashboard_endpoint_serves_the_payload(client):
    response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {
        "won",
        "pipeline",
        "funnel",
        "money",
        "recent_activity",
        "follow_ups",
    }
    assert len(payload["won"]["months"]) == 12
    assert payload["pipeline"]["count"] > 0
    assert payload["recent_activity"]
