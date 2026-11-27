from datetime import UTC, date, datetime, timedelta

import pytest
from app import auth, db, seed
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
                db.bills,
            )
        }


def test_schema_has_the_eight_tables(engine):
    seed.ensure_seeded(engine)
    assert set(inspect(engine).get_table_names()) == {
        "organizations",
        "contacts",
        "deals",
        "activities",
        "company_settings",
        "products",
        "bills",
        "number_counters",
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
    assert [column["name"] for column in columns("bills")] == [
        "id",
        "organization_id",
        "bill_number",
        "bill_date",
        "due_date",
        "category",
        "amount_cents",
        "tax_cents",
        "total_cents",
        "notes",
        "paid_date",
        "created_by",
        "updated_by",
    ]
    assert [column["name"] for column in columns("number_counters")] == [
        "id",
        "kind",
        "last_number",
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
    assert (organizations, contacts, deals) == (21, 24, 30)


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


def test_three_supplier_organizations_come_with_bills(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        counts = dict(
            conn.execute(
                select(db.organizations.c.name, func.count(db.bills.c.id))
                .select_from(
                    db.bills.join(
                        db.organizations,
                        db.bills.c.organization_id == db.organizations.c.id,
                    )
                )
                .group_by(db.organizations.c.name)
            ).all()
        )

    assert set(counts) == {
        "Vantage Software",
        "Cedar Contractors",
        "Riverview Property",
    }
    assert all(count > 0 for count in counts.values())


def test_sample_bills_cover_every_month_category_and_status(engine):
    seed.ensure_seeded(engine)
    today = date.today()
    with engine.connect() as conn:
        bills = conn.execute(select(db.bills)).mappings().all()

    assert bills
    assert {bill["category"] for bill in bills} == {
        "Software",
        "Contractors",
        "Travel",
        "Office",
        "Marketing",
        "Other",
    }

    unpaid = [bill for bill in bills if bill["paid_date"] is None]
    assert any(bill["due_date"] < today for bill in unpaid)  # overdue bills
    assert any(
        today <= bill["due_date"] <= today + timedelta(days=30) for bill in unpaid
    )

    # Every one of the last twelve months has paid bills, so every month of
    # the spending chart has bars.
    paid_months = {
        f"{bill['paid_date'].year}-{bill['paid_date'].month:02d}"
        for bill in bills
        if bill["paid_date"] is not None
    }
    assert {
        start.strftime("%Y-%m") for start in month_buckets.last_month_starts(today)
    } <= paid_months


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
            db.bills,
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
        bills = client.get("/api/bills").json()

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
    assert bills and {
        "bill_number",
        "organization_name",
        "total_cents",
        "status",
    } <= set(bills[0])

    assert isinstance(activities[0]["happened_at"], str)
    assert isinstance(deals[0]["close_date"], str)
    assert datetime.fromisoformat(activities[0]["happened_at"])
    assert date.fromisoformat(deals[0]["close_date"])
