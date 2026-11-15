"""Engine, connection and schema for the four tables (SQLAlchemy Core)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

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
)
from sqlalchemy.engine import CursorResult, Engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "accountable.db"

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
)


def database_path() -> Path:
    override = os.environ.get("ACCOUNTABLE_DB")
    if override:
        return Path(override)
    return DEFAULT_DB_PATH


def inserted_id(result: CursorResult) -> int:
    """The primary key of the single row an insert just wrote."""
    primary_key = result.inserted_primary_key
    assert primary_key is not None, "insert returned no primary key"
    return primary_key[0]


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(
        f"sqlite:///{database_path()}",
        connect_args={"check_same_thread": False},
    )
