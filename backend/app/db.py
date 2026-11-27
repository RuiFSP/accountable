"""Engine, connection, schema and migrations for the tables (SQLAlchemy Core)."""

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
    Index,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    inspect,
    text,
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
    # Added by 0007, which can only append it.
    Column("billing_address", Text),
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

company_settings = Table(
    "company_settings",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("address", Text),
    Column("email", String),
    Column("phone", String),
    Column("tax_label", String),
    Column("tax_rate_thousandths", Integer, nullable=False),
    Column("payment_terms_days", Integer, nullable=False),
    Column("quote_prefix", String),
    Column("invoice_prefix", String),
    Column("updated_by", String),
    Column("updated_at", DateTime, nullable=False),
    # Added by 0008, which can only append them: the Documents section's
    # design, accent and logo, with the Classic design and the Midnight accent
    # for rows that predate it.
    Column("invoice_design", String, nullable=False),
    Column("accent_color", String, nullable=False),
    Column("logo_data", LargeBinary),
    Column("logo_content_type", String),
)

products = Table(
    "products",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("description", Text),
    Column("price_cents", Integer, nullable=False),
    Column("active", Boolean, nullable=False),
    Column("created_by", String),
    Column("updated_by", String),
)

# How many numbers each kind of document has taken, so the next is one more.
# A kind's row is added when it takes its first number. Quotes and invoices are
# counted apart, and a reset clears the rows with every other table.
number_counters = Table(
    "number_counters",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("kind", String, nullable=False, unique=True),
    Column("last_number", Integer, nullable=False),
)

# The bill for one won deal. An invoice takes its number when it is issued and
# keeps it forever; a draft's number, dates and tax columns stay empty. The tax
# label and rate and the Bill to block are written at issue, so later changes to
# Settings, the organization or the contact never move an issued invoice.
invoices = Table(
    "invoices",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("number", String, unique=True),
    Column("deal_id", Integer, ForeignKey("deals.id"), nullable=False),
    Column("organization_id", Integer, ForeignKey("organizations.id"), nullable=False),
    Column("status", String, nullable=False),
    Column("issue_date", Date),
    Column("due_date", Date),
    Column("subtotal_cents", Integer, nullable=False),
    Column("tax_label", String),
    Column("tax_rate_thousandths", Integer),
    Column("tax_cents", Integer),
    Column("total_cents", Integer),
    Column("bill_to_name", String),
    Column("bill_to_address", Text),
    Column("bill_to_contact_name", String),
    Column("bill_to_contact_email", String),
    Column("created_by", String),
    Column("updated_by", String),
)

# One non-void invoice per deal, on SQLite and Postgres alike: a voided invoice
# is kept for the record and does not stop a replacement.
Index(
    "uq_invoices_deal_not_void",
    invoices.c.deal_id,
    unique=True,
    sqlite_where=text("status != 'void'"),
    postgresql_where=text("status != 'void'"),
)

# A line keeps the product's name and price as they were when it was added;
# product_id is a pointer only, and a product's later change never touches it.
invoice_lines = Table(
    "invoice_lines",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("invoice_id", Integer, ForeignKey("invoices.id"), nullable=False),
    Column("product_id", Integer, ForeignKey("products.id")),
    Column("description", String, nullable=False),
    Column("quantity", Integer, nullable=False),
    Column("unit_price_cents", Integer, nullable=False),
    Column("position", Integer, nullable=False),
)

# Payments land against an issued invoice only. paid_on is a plain calendar
# date, and created_by records who entered the payment.
payments = Table(
    "payments",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("invoice_id", Integer, ForeignKey("invoices.id"), nullable=False),
    Column("paid_on", Date, nullable=False),
    Column("amount_cents", Integer, nullable=False),
    Column("method", String, nullable=False),
    Column("reference", String),
    Column("created_by", String),
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
    ``alembic_version``, so it is stamped at the revision it matches first and
    upgraded from there — its data survives.
    """
    target = get_engine() if engine is None else engine
    _upgrade_schema(target)
    from app import seed  # deferred: seed imports this module

    seed.repair_links(target)
    if not seed.is_seeded(target):
        seed.seed(target)
    seed.ensure_settings(target)


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

    The exact revision its tables and columns match: a pre-change database
    gets the baseline, one with the attribution columns but no products table
    gets 0002, one with products but not the settings table gets 0003, one
    carrying the settings table gets 0004, one with the number counters gets
    0005, and one with the invoice tables gets 0006, 0007 or 0008 by which of
    the later columns landed. Stamping head would let a database skip a
    migration it still needs.
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if not tables or "alembic_version" in tables or "organizations" not in tables:
        return None
    if "invoices" in tables:
        if "invoice_design" in _column_names(inspector, "company_settings"):
            return "0008"
        if "billing_address" in _column_names(inspector, "organizations"):
            return "0007"
        return "0006"
    if "number_counters" in tables:
        return "0005"
    if "company_settings" in tables:
        return "0004"
    if "products" in tables:
        return "0003"
    return (
        "0002"
        if "created_by" in _column_names(inspector, "organizations")
        else BASELINE_REVISION
    )


def _column_names(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}
