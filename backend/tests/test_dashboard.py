from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app import db, stats
from app.main import app

# Fixed "today" so every figure in the fixture is deterministic.
TODAY = date(2026, 6, 15)


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'dashboard.db'}")
    db.metadata.create_all(test_engine)

    with test_engine.begin() as connection:
        organization_id = connection.execute(
            db.organizations.insert().values(
                name="Fixture Org", website=None, industry=None, notes=None
            )
        ).inserted_primary_key[0]
        contact_id = connection.execute(
            db.contacts.insert().values(
                name="Fixture Contact",
                email=None,
                phone=None,
                job_title=None,
                organization_id=organization_id,
                status="lead",
            )
        ).inserted_primary_key[0]

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

        def activity(description, happened_at, follow_up_date=None, done=False, kind="note"):
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
    assert by_month["2026-06"] == {"month": "2026-06", "revenue_cents": 100_000, "deals": 1}
    assert by_month["2025-07"] == {"month": "2025-07", "revenue_cents": 200_000, "deals": 1}
    assert by_month["2025-12"] == {"month": "2025-12", "revenue_cents": 0, "deals": 0}

    assert won["total_revenue_cents"] == 300_000  # the too-old win excluded
    assert won["total_deals"] == 2


def test_pipeline_totals_count_open_deals_only(conn):
    pipeline = stats.pipeline_totals(conn)

    assert pipeline["value_cents"] == 199_999  # won and lost excluded
    assert pipeline["count"] == 2
    assert pipeline["expected_cents"] == (100_000 * 10 // 100) + (99_999 * 50 // 100)


def test_funnel_shows_each_open_stage_plus_won_and_lost(conn):
    funnel = stats.funnel(conn, TODAY)

    by_stage = {row["stage"]: row for row in funnel["stages"]}
    assert set(by_stage) == {"New", "Qualified", "Proposal", "Negotiation"}
    assert by_stage["New"] == {"stage": "New", "count": 1, "value_cents": 100_000, "expected_cents": 10_000}
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
    assert descriptions[:4] == ["Newest note", "Stage moved", "Middle note", "Oldest note"]
    assert "Stage moved" in descriptions
    assert all(row["type"] == "stage_change" for row in recent if row["description"] == "Stage moved")
    assert len(recent) <= stats.RECENT_ACTIVITY_LIMIT


def test_follow_ups_split_into_overdue_and_upcoming(conn):
    follow_ups = stats.follow_ups(conn, TODAY)

    assert [row["description"] for row in follow_ups["overdue"]] == ["Overdue call"]
    assert [row["description"] for row in follow_ups["upcoming"]] == ["Upcoming email"]
    assert follow_ups["overdue_count"] == 1
    assert follow_ups["open_count"] == 2  # done and follow-up-less activities excluded


def test_dashboard_payload_holds_every_figure(conn):
    payload = stats.dashboard_payload(conn, TODAY)

    assert set(payload) == {"won", "pipeline", "funnel", "recent_activity", "follow_ups"}
    assert payload["won"]["total_revenue_cents"] == 300_000
    assert payload["pipeline"]["count"] == 2
    assert payload["follow_ups"]["overdue_count"] == 1
    assert payload["recent_activity"][0]["description"] == "Newest note"


def test_dashboard_endpoint_serves_the_payload():
    with TestClient(app) as client:
        response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"won", "pipeline", "funnel", "recent_activity", "follow_ups"}
    assert len(payload["won"]["months"]) == 12
    assert payload["pipeline"]["count"] > 0
    assert payload["recent_activity"]
