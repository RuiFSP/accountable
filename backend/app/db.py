"""Engine, connection, schema and migrations for the four tables (SQLAlchemy Core)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    inspect,
)
from sqlalchemy.engine import CursorResult, Engine

from app.settings import Settings, load_settings

BACKEND_DIR = Path(__file__).resolve().parent.parent
BASELINE_REVISION = "0001"

# Usual probability of close per stage; a stage move resets a deal to these.
STAGE_PROBABILITIES = {
    "New": 10,
    "Qualified": 25,
    "Proposal": 50,
    "Negotiation": 75,
    "Won": 100,
    "Lost": 0,
}

metadata = MetaData()

organizations = Table(
    "organizations",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("website", String),
    Column("industry", String),
    Column("notes", Text),
    Column("created_by", String),
    Column("updated_by", String),
)

contacts = Table(
    "contacts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("email", String),
    Column("phone", String),
    Column("job_title", String),
    Column("organization_id", Integer, ForeignKey("organizations.id")),
    Column("status", String, nullable=False),
    Column("created_by", String),
    Column("updated_by", String),
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("organization_id", Integer, ForeignKey("organizations.id")),
    Column("contact_id", Integer, ForeignKey("contacts.id")),
    Column("stage", String, nullable=False),
    Column("value_cents", Integer, nullable=False),
    Column("probability", Integer, nullable=False),
    Column("close_date", Date),
    Column("position", Integer, nullable=False),
    Column("created_by", String),
    Column("updated_by", String),
)

activities = Table(
    "activities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("type", String, nullable=False),
    Column("contact_id", Integer, ForeignKey("contacts.id")),
    Column("deal_id", Integer, ForeignKey("deals.id")),
    Column("description", String, nullable=False),
    Column("happened_at", DateTime, nullable=False),
    Column("follow_up_date", Date),
    Column("done", Boolean, nullable=False),
    Column("created_by", String),
    Column("updated_by", String),
)


def inserted_id(result: CursorResult) -> int:
    """The primary key of the single row an insert just wrote."""
    primary_key = result.inserted_primary_key
    assert primary_key is not None, "insert returned no primary key"
    return primary_key[0]


def engine_for(settings: Settings) -> Engine:
    """The engine the settings name: Postgres with pre-ping, or today's SQLite."""
    if settings.mode == "shared":
        # pre-ping: a connection dropped while Render slept is not reused.
        return create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
    return create_engine(
        settings.sqlalchemy_url, connect_args={"check_same_thread": False}
    )


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return engine_for(load_settings())


def prepare(engine: Engine | None = None) -> None:
    """Bring the database to the latest schema, repair links, seed if new.

    A database built before this change has its tables but no
    ``alembic_version``, so it is stamped at the baseline first and
    upgraded from there — its data survives.
    """
    target = get_engine() if engine is None else engine
    _upgrade_schema(target)
    from app import seed  # deferred: seed imports this module

    seed.repair_links(target)
    if not seed.is_seeded(target):
        seed.seed(target)


def _upgrade_schema(engine: Engine) -> None:
    revision = _unversioned_revision(engine)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        if revision is not None:
            command.stamp(config, revision)
        command.upgrade(config, "head")


def _unversioned_revision(engine: Engine) -> str | None:
    """Revision to stamp a database that has tables but no version table.

    Pre-change databases get the baseline, so only the second migration runs
    and their rows survive; databases already carrying the current schema get
    head, so the second migration is not run against columns it would add.
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if not tables or "alembic_version" in tables or "organizations" not in tables:
        return None
    columns = {column["name"] for column in inspector.get_columns("organizations")}
    return "head" if "created_by" in columns else BASELINE_REVISION
