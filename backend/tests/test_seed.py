from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select

from app import db, seed


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    yield test_engine
    test_engine.dispose()


def _counts(engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table.name: conn.execute(select(func.count()).select_from(table)).scalar_one()
            for table in (db.organizations, db.contacts, db.deals, db.activities)
        }


def test_schema_has_the_four_tables(engine):
    seed.ensure_seeded(engine)
    assert set(inspect(engine).get_table_names()) == {"organizations", "contacts", "deals", "activities"}


def test_schema_fields_match_the_data_model(engine):
    seed.ensure_seeded(engine)
    columns = inspect(engine).get_columns
    assert [column["name"] for column in columns("organizations")] == [
        "id",
        "name",
        "website",
        "industry",
        "notes",
    ]
    assert [column["name"] for column in columns("contacts")] == [
        "id",
        "name",
        "email",
        "phone",
        "job_title",
        "organization_id",
        "status",
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
    ]


def test_fresh_database_is_seeded(engine):
    seed.ensure_seeded(engine)
    counts = _counts(engine)
    assert all(count > 0 for count in counts.values()), counts


def test_sample_data_covers_every_stage(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        stages = set(conn.execute(select(db.deals.c.stage)).scalars())
    assert stages == set(db.STAGE_PROBABILITIES)


def test_sample_data_covers_every_contact_status(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        statuses = set(conn.execute(select(db.contacts.c.status)).scalars())
    assert statuses == {"lead", "qualified", "customer"}


def test_sample_data_has_open_deals_due_ahead_and_running_late(engine):
    seed.ensure_seeded(engine)
    today = date.today()
    with engine.connect() as conn:
        open_dates = conn.execute(
            select(db.deals.c.close_date).where(db.deals.c.stage.not_in(["Won", "Lost"]))
        ).scalars().all()
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


def test_activities_link_to_exactly_one_record(engine):
    seed.ensure_seeded(engine)
    with engine.connect() as conn:
        rows = conn.execute(select(db.activities.c.contact_id, db.activities.c.deal_id)).all()
    assert rows
    assert all((contact_id is None) != (deal_id is None) for contact_id, deal_id in rows)


def test_reseeding_is_idempotent(engine):
    seed.ensure_seeded(engine)
    before = _counts(engine)
    seed.ensure_seeded(engine)
    assert _counts(engine) == before
    seed.seed(engine)
    assert _counts(engine) == before


def test_startup_repairs_links_that_point_at_missing_records(engine):
    seed.ensure_seeded(engine)
    with engine.begin() as conn:
        deal_id = conn.execute(select(db.deals.c.id).limit(1)).scalar_one()
        contact_id = conn.execute(select(db.contacts.c.id).limit(1)).scalar_one()
        conn.execute(db.deals.update().where(db.deals.c.id == deal_id).values(contact_id=999_999))
        conn.execute(
            db.contacts.update().where(db.contacts.c.id == contact_id).values(organization_id=999_999)
        )

    seed.repair_links(engine)

    with engine.connect() as conn:
        assert conn.execute(
            select(db.deals.c.contact_id).where(db.deals.c.id == deal_id)
        ).scalar_one() is None
        assert conn.execute(
            select(db.contacts.c.organization_id).where(db.contacts.c.id == contact_id)
        ).scalar_one() is None
        # Links that were already valid, and every record, are left alone.
        others = conn.execute(select(db.deals.c.contact_id).where(db.deals.c.id != deal_id)).scalars().all()
        assert others and all(other is not None for other in others)
    assert all(count > 0 for count in _counts(engine).values())


def test_api_serves_the_seeded_records():
    from app.main import app

    with TestClient(app) as client:
        organizations = client.get("/api/organizations").json()
        contacts = client.get("/api/contacts").json()
        deals = client.get("/api/deals").json()
        activities = client.get("/api/activities").json()

    assert organizations and {"id", "name", "website", "industry", "notes"} <= set(organizations[0])
    assert contacts and {"name", "email", "status"} <= set(contacts[0])
    assert deals and {"stage", "value_cents", "probability", "close_date", "position"} <= set(deals[0])
    assert activities and {"type", "description", "happened_at", "done"} <= set(activities[0])

    assert isinstance(activities[0]["happened_at"], str)
    assert isinstance(deals[0]["close_date"], str)
    assert datetime.fromisoformat(activities[0]["happened_at"])
    assert date.fromisoformat(deals[0]["close_date"])
