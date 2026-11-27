from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta

import pytest
from app import auth, db, documents, images, invoice_state, seed
from app import months as month_buckets
from sqlalchemy import create_engine, func, inspect, select


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    yield test_engine
    test_engine.dispose()


def _counts(engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table.name: conn.execute(
                select(func.count()).select_from(table)
            ).scalar_one()
            for table in (
                db.organizations,
                db.contacts,
                db.deals,
                db.activities,
                db.company_settings,
                db.products,
                db.invoices,
                db.invoice_lines,
                db.payments,
            )
        }


def test_schema_has_the_tables(engine):
    seed.ensure_seeded(engine)
    assert set(inspect(engine).get_table_names()) == {
        "organizations",
        "contacts",
        "deals",
        "activities",
        "company_settings",
        "products",
        "number_counters",
        "invoices",
        "invoice_lines",
        "payments",
    }


def test_schema_fields_match_the_data_model(engine):
    seed.ensure_seeded(engine)
    columns = inspect(engine).get_columns
    assert [column["name"] for column in columns("organizations")] == [
        "id",
        "name",
        "website",
        "industry",
        "notes",
        "created_by",
        "updated_by",
        "billing_address",
    ]
    assert [column["name"] for column in columns("contacts")] == [
        "id",
        "name",
        "email",
        "phone",
        "job_title",
        "organization_id",
        "status",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("deals")] == [
        "id",
        "name",
        "organization_id",
        "contact_id",
        "stage",
        "value_cents",
        "probability",
        "close_date",
        "position",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("activities")] == [
        "id",
        "type",
        "contact_id",
        "deal_id",
        "description",
        "happened_at",
        "follow_up_date",
        "done",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("company_settings")] == [
        "id",
        "name",
        "address",
        "email",
        "phone",
        "tax_label",
        "tax_rate_thousandths",
        "payment_terms_days",
        "quote_prefix",
        "invoice_prefix",
        "updated_by",
        "updated_at",
        "invoice_design",
        "accent_color",
        "logo_data",
        "logo_content_type",
    ]
    assert [column["name"] for column in columns("products")] == [
        "id",
        "name",
        "description",
        "price_cents",
        "active",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("number_counters")] == [
        "id",
        "kind",
        "last_number",
    ]
    assert [column["name"] for column in columns("invoices")] == [
        "id",
        "number",
        "deal_id",
        "organization_id",
        "status",
        "issue_date",
        "due_date",
        "subtotal_cents",
        "tax_label",
        "tax_rate_thousandths",
        "tax_cents",
        "total_cents",
        "bill_to_name",
        "bill_to_address",
        "bill_to_contact_name",
        "bill_to_contact_email",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("invoice_lines")] == [
        "id",
        "invoice_id",
        "product_id",
        "description",
        "quantity",
        "unit_price_cents",
        "position",
    ]
    assert [column["name"] for column in columns("payments")] == [
        "id",
        "invoice_id",
        "paid_on",
        "amount_cents",
        "method",
        "reference",
        "created_by",
    ]


def test_fresh_database_is_seeded(engine):
    seed.ensure_seeded(engine)
    counts = _counts(engine)
    assert all(count > 0 for count in counts.values()), counts


def _settings(engine) -> dict:
    with engine.connect() as connection:
        return dict(connection.execute(select(db.company_settings)).mappings().one())


def test_fresh_database_starts_as_brightloop(engine):
    seed.ensure_seeded(engine)

    settings = _settings(engine)

    assert settings["id"] == 1
    assert settings["name"] == "Brightloop"
    assert settings["address"] == ("1 Brightloop Plaza, Floor 12, New York, NY 10004")
    assert settings["email"] == "hello@brightloop.example"
    assert settings["phone"] == "+1 555 0100"
    assert settings["tax_label"] == "Sales tax"
    assert settings["tax_rate_thousandths"] == 8875
    assert settings["payment_terms_days"] == 30
    assert settings["quote_prefix"] == "QT-"
    assert settings["invoice_prefix"] == "INV-"
    assert settings["updated_by"] == "priya@brightloop.example"
    # Two days before the seed ran, as the spec says, on the clock the seed
    # made it from: UTC, never the machine's local date.
    assert settings["updated_at"].date() == datetime.now(UTC).date() - timedelta(days=2)


def test_a_database_with_records_but_no_settings_row_gets_one(engine):
    seed.ensure_seeded(engine)
    with engine.begin() as connection:
        connection.execute(db.company_settings.delete())

    db.prepare(engine)

    settings = _settings(engine)
    assert settings["name"] == "Brightloop"
    assert settings["updated_by"] == "priya@brightloop.example"


def test_an_existing_settings_row_is_not_replaced(engine):
    seed.ensure_seeded(engine)
    with engine.begin() as connection:
        connection.execute(
            db.company_settings.update()
            .where(db.company_settings.c.id == 1)
            .values(name="Brightloop Studio", tax_rate_thousandths=7000)
        )

    db.prepare(engine)
    seed.ensure_settings(engine)

    settings = _settings(engine)
    assert settings["name"] == "Brightloop Studio"
    assert settings["tax_rate_thousandths"] == 7000


def test_sample_data_covers_every_stage(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        stages = set(conn.execute(select(db.deals.c.stage)).scalars())
    assert stages == set(db.STAGE_PROBABILITIES)


def test_sample_data_has_a_year_of_won_deals_and_work_in_proposal_and_negotiation(
    engine,
):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        won = conn.execute(
            select(func.count()).select_from(db.deals).where(db.deals.c.stage == "Won")
        ).scalar_one()
        working = conn.execute(
            select(func.count())
            .select_from(db.deals)
            .where(db.deals.c.stage.in_(["Proposal", "Negotiation"]))
        ).scalar_one()
        organizations = conn.execute(
            select(func.count()).select_from(db.organizations)
        ).scalar_one()
        contacts = conn.execute(
            select(func.count()).select_from(db.contacts)
        ).scalar_one()
        deals = conn.execute(select(func.count()).select_from(db.deals)).scalar_one()

    assert (won, working) == (12, 8)
    assert (organizations, contacts, deals) == (18, 24, 30)


def test_sample_data_covers_every_contact_status(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        statuses = set(conn.execute(select(db.contacts.c.status)).scalars())
    assert statuses == {"lead", "qualified", "customer"}


def test_sample_data_has_open_deals_due_ahead_and_running_late(engine):
    seed.ensure_seeded(engine)
    today = date.today()
    with engine.connect() as conn:
        open_dates = (
            conn.execute(
                select(db.deals.c.close_date).where(
                    db.deals.c.stage.not_in(["Won", "Lost"])
                )
            )
            .scalars()
            .all()
        )
    assert any(close_date > today for close_date in open_dates)
    assert any(close_date < today for close_date in open_dates)


def test_sample_data_has_follow_ups_overdue_upcoming_and_done(engine):
    seed.ensure_seeded(engine)
    today = date.today()
    with engine.connect() as conn:
        pending = conn.execute(
            select(db.activities.c.follow_up_date, db.activities.c.done).where(
                db.activities.c.follow_up_date.is_not(None)
            )
        ).all()
    assert any(not done and follow_up < today for follow_up, done in pending)
    assert any(not done and follow_up >= today for follow_up, done in pending)
    assert any(done for _, done in pending)


def test_sample_data_has_a_dozen_products_with_two_archived(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        products = conn.execute(
            select(db.products.c.name, db.products.c.price_cents, db.products.c.active)
        ).all()

    assert len(products) == 12
    assert sum(1 for product in products if product.active) == 10
    assert sum(1 for product in products if not product.active) == 2
    assert any(product.price_cents % 100 for product in products)

    prices = {product.name: product.price_cents for product in products}
    assert prices["Priority support"] == 14_950
    assert prices["Onsite training day"] == 120_000


def test_activities_link_to_exactly_one_record(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        rows = conn.execute(
            select(db.activities.c.contact_id, db.activities.c.deal_id)
        ).all()
    assert rows
    assert all(
        (contact_id is None) != (deal_id is None) for contact_id, deal_id in rows
    )


def _attribution(engine) -> list[tuple]:
    """The two emails every sample row carries: who added it, who changed it."""
    with engine.connect() as connection:
        rows = []
        for table in (
            db.organizations,
            db.contacts,
            db.deals,
            db.activities,
            db.products,
            db.invoices,
        ):
            rows += connection.execute(
                select(table.c.created_by, table.c.updated_by)
            ).all()
    return rows


def test_the_sample_comes_with_four_teammates_one_without_a_name(engine):
    seed.ensure_seeded(engine)

    assert len(auth.TEAMMATES) == 4
    assert [teammate["name"] for teammate in auth.TEAMMATES].count("") == 1
    # Every teammate is in the data, so the one with no name has records
    # whose line has only the email to fall back to.
    assert {teammate["email"] for teammate in auth.TEAMMATES} <= {
        email for row in _attribution(engine) for email in row
    }


def test_every_sample_record_is_attributed_to_a_teammate(engine):
    seed.ensure_seeded(engine)
    teammate_emails = {teammate["email"] for teammate in auth.TEAMMATES}

    rows = _attribution(engine)

    assert rows
    assert all(created and updated for created, updated in rows)
    assert {email for row in rows for email in row} <= teammate_emails


def test_some_sample_records_were_last_changed_by_another_teammate(engine):
    seed.ensure_seeded(engine)

    rows = _attribution(engine)

    assert any(created != updated for created, updated in rows)


def test_sample_stage_changes_go_down_to_a_teammate(engine):
    seed.ensure_seeded(engine)
    teammate_emails = {teammate["email"] for teammate in auth.TEAMMATES}

    with engine.connect() as connection:
        moves = connection.execute(
            select(db.activities.c.created_by, db.activities.c.updated_by).where(
                db.activities.c.type == "stage_change"
            )
        ).all()

    assert moves
    assert all(email in teammate_emails for move in moves for email in move)


def test_reseeding_is_idempotent(engine):
    seed.ensure_seeded(engine)
    before = _counts(engine)
    seed.ensure_seeded(engine)
    assert _counts(engine) == before
    seed.seed(engine)
    assert _counts(engine) == before
    assert before["company_settings"] == 1


def test_startup_repairs_links_that_point_at_missing_records(engine):
    seed.ensure_seeded(engine)
    with engine.begin() as conn:
        deal_id = conn.execute(select(db.deals.c.id).limit(1)).scalar_one()
        contact_id = conn.execute(select(db.contacts.c.id).limit(1)).scalar_one()
        conn.execute(
            db.deals.update().where(db.deals.c.id == deal_id).values(contact_id=999_999)
        )
        conn.execute(
            db.contacts.update()
            .where(db.contacts.c.id == contact_id)
            .values(organization_id=999_999)
        )

    seed.repair_links(engine)

    with engine.connect() as conn:
        assert (
            conn.execute(
                select(db.deals.c.contact_id).where(db.deals.c.id == deal_id)
            ).scalar_one()
            is None
        )
        assert (
            conn.execute(
                select(db.contacts.c.organization_id).where(
                    db.contacts.c.id == contact_id
                )
            ).scalar_one()
            is None
        )
        # Links that were already valid, and every record, are left alone.
        others = (
            conn.execute(select(db.deals.c.contact_id).where(db.deals.c.id != deal_id))
            .scalars()
            .all()
        )
        assert others and all(other is not None for other in others)
    assert all(count > 0 for count in _counts(engine).values())


def test_api_serves_the_seeded_records(client_for, sign_in_as):
    from app.main import app

    with client_for(app, sign_in_as()) as client:
        organizations = client.get("/api/organizations").json()
        contacts = client.get("/api/contacts").json()
        deals = client.get("/api/deals").json()
        activities = client.get("/api/activities").json()
        settings = client.get("/api/settings").json()
        products = client.get("/api/products").json()

    assert organizations and {"id", "name", "website", "industry", "notes"} <= set(
        organizations[0]
    )
    assert contacts and {"name", "email", "status"} <= set(contacts[0])
    assert deals and {
        "stage",
        "value_cents",
        "probability",
        "close_date",
        "position",
    } <= set(deals[0])
    assert activities and {"type", "description", "happened_at", "done"} <= set(
        activities[0]
    )
    assert settings["name"] == "Brightloop"
    assert settings["tax_rate_thousandths"] == 8875
    assert settings["updated_by"] == "priya@brightloop.example"
    assert products and {
        "name",
        "description",
        "price_cents",
        "active",
    } <= set(products[0])
    assert len(products) == 10

    assert isinstance(activities[0]["happened_at"], str)
    assert isinstance(deals[0]["close_date"], str)
    assert datetime.fromisoformat(activities[0]["happened_at"])
    assert date.fromisoformat(deals[0]["close_date"])


def test_every_won_deal_of_the_last_year_has_one_invoice_whose_lines_add_up(
    engine,
):
    seed.ensure_seeded(engine)
    window = month_buckets.last_month_starts(date.today())[0]

    with engine.connect() as conn:
        won = conn.execute(
            select(db.deals.c.id, db.deals.c.value_cents).where(
                db.deals.c.stage == "Won",
                db.deals.c.close_date.is_not(None),
                db.deals.c.close_date >= window,
            )
        ).all()
        invoices = conn.execute(select(db.invoices)).mappings().all()
        lines = conn.execute(select(db.invoice_lines)).mappings().all()

    by_deal = defaultdict(list)
    for invoice in invoices:
        by_deal[invoice["deal_id"]].append(invoice)
    lines_by_invoice = defaultdict(list)
    for line in lines:
        lines_by_invoice[line["invoice_id"]].append(line)

    assert len(won) >= 11  # one deal can close outside the window on some days
    for deal_id, value_cents in won:
        mine = by_deal[deal_id]
        assert len(mine) == 1, f"deal {deal_id} has {len(mine)} invoices"
        invoice = mine[0]
        assert invoice["subtotal_cents"] == value_cents
        assert (
            sum(
                line["quantity"] * line["unit_price_cents"]
                for line in lines_by_invoice[invoice["id"]]
            )
            == value_cents
        )


def test_the_sample_invoices_spread_over_paid_part_paid_overdue_and_draft(engine):
    seed.ensure_seeded(engine)
    today = date.today()

    with engine.connect() as conn:
        issued = conn.execute(
            select(
                db.invoices.c.status,
                db.invoices.c.due_date,
                db.invoices.c.total_cents,
                func.coalesce(func.sum(db.payments.c.amount_cents), 0),
            )
            .select_from(
                db.invoices.outerjoin(
                    db.payments, db.payments.c.invoice_id == db.invoices.c.id
                )
            )
            .where(db.invoices.c.status == invoice_state.ISSUED)
            .group_by(db.invoices.c.id)
        ).all()
        drafts = conn.execute(
            select(func.count())
            .select_from(db.invoices)
            .where(db.invoices.c.status == invoice_state.DRAFT)
        ).scalar_one()

    shown = {
        invoice_state.display_status(status, total, paid, due, today)
        for status, due, total, paid in issued
    }
    assert {"paid", "part paid", "overdue"} <= shown
    assert drafts >= 1

    # Money still owed sits in every one of the five buckets, by different ages.
    owed = [(due, total - paid) for _, due, total, paid in issued if total > paid]
    assert owed
    buckets = {invoice_state.aging_bucket(due, today) for due, _ in owed}
    assert buckets == set(invoice_state.AGING_BUCKETS)
    ages = {invoice_state.days_overdue(due, today) for due, _ in owed if due < today}
    assert len(ages) >= 3


def test_the_sample_counts_are_pinned_for_the_figures_quoted_in_docs(engine):
    """The composition `docs/STATUS.md` quotes, taken from this run, not from memory."""
    seed.ensure_seeded(engine)
    today = date.today()

    with engine.connect() as conn:
        rows = conn.execute(
            select(
                db.invoices.c.status,
                db.invoices.c.due_date,
                db.invoices.c.total_cents,
                func.coalesce(func.sum(db.payments.c.amount_cents), 0),
            )
            .select_from(
                db.invoices.outerjoin(
                    db.payments, db.payments.c.invoice_id == db.invoices.c.id
                )
            )
            .group_by(db.invoices.c.id)
        ).all()
        payments = conn.execute(
            select(func.count()).select_from(db.payments)
        ).scalar_one()

    shown = Counter(
        invoice_state.display_status(status, total, paid, due, today)
        for status, due, total, paid in rows
    )
    assert dict(shown) == {
        invoice_state.PAID: 5,
        invoice_state.PART_PAID: 1,
        invoice_state.OVERDUE: 4,
        invoice_state.DRAFT: 2,
    }
    assert payments == 13


def test_the_organizations_with_invoices_carry_billing_addresses(engine):
    seed.ensure_seeded(engine)

    with engine.connect() as conn:
        without = conn.execute(
            select(db.organizations.c.name).where(
                db.organizations.c.billing_address.is_(None),
                db.organizations.c.id.in_(select(db.invoices.c.organization_id)),
            )
        ).all()

    assert without == []


def test_the_settings_row_comes_with_a_design_and_its_logo(engine):
    seed.ensure_seeded(engine)

    with engine.connect() as conn:
        row = (
            conn.execute(
                select(db.company_settings).where(db.company_settings.c.id == 1)
            )
            .mappings()
            .one()
        )

    assert row["invoice_design"] == documents.DEFAULT_INVOICE_DESIGN
    assert row["accent_color"] == documents.DEFAULT_ACCENT_COLOR
    assert row["logo_content_type"] == "image/png"
    assert images.content_type_of(row["logo_data"]) == "image/png"


def test_payments_are_spread_across_the_year_the_charts_show(engine):
    seed.ensure_seeded(engine)
    window = month_buckets.last_month_starts(date.today())

    with engine.connect() as conn:
        paid_on = conn.execute(select(db.payments.c.paid_on)).scalars().all()

    assert paid_on
    assert all(window[0] <= day <= date.today() for day in paid_on)
    months = {month_buckets.month_key(day) for day in paid_on}
    assert len(months) >= 6
    assert len(months) <= len(window)


def test_the_next_invoice_number_is_not_one_the_seed_already_gave(engine):
    seed.ensure_seeded(engine)

    with engine.connect() as conn:
        numbers = (
            conn.execute(
                select(db.invoices.c.number).where(db.invoices.c.number.is_not(None))
            )
            .scalars()
            .all()
        )
        counter = conn.execute(
            select(db.number_counters.c.last_number).where(
                db.number_counters.c.kind == "invoice"
            )
        ).scalar_one()

    assert len(numbers) == 10
    assert sorted(numbers)[-1] == f"INV-{counter:04d}"
