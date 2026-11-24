"""Sample data: fills a new database, rebuilds it on reset."""

from __future__ import annotations

import itertools
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from app import db
from app.auth import TEAMMATES

STAGE_PROBABILITIES = db.STAGE_PROBABILITIES

CONFIRMATION_PROMPT = (
    "This deletes all data and reloads the sample data. Continue? [y/N] "
)


def _teammate_email(teammate_id: str) -> str:
    return next(
        teammate["email"] for teammate in TEAMMATES if teammate["id"] == teammate_id
    )


def _settings_row() -> dict:
    """Brightloop's details, last changed by Priya two days before the seed runs."""
    return {
        "id": 1,
        "name": "Brightloop",
        "address": "1 Brightloop Plaza, Floor 12, New York, NY 10004",
        "email": "hello@brightloop.example",
        "phone": "+1 555 0100",
        "tax_label": "Sales tax",
        "tax_rate_thousandths": 8875,
        "payment_terms_days": 30,
        "quote_prefix": "QT-",
        "invoice_prefix": "INV-",
        "updated_by": _teammate_email("priya"),
        "updated_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2),
    }


def _attribution(offset: int) -> dict[str, str]:
    """Who added a sample row and who last changed it: made-up teammates.

    Every third row shows a different teammate as who last changed it, so
    both lines on a record's page have a case in the sample data.
    """
    added = TEAMMATES[offset % len(TEAMMATES)]["email"]
    if offset % 3 == 0:
        changed = TEAMMATES[(offset + 1) % len(TEAMMATES)]["email"]
    else:
        changed = added
    return {"created_by": added, "updated_by": changed}


def _days(offset: int) -> date:
    return date.today() + timedelta(days=offset)


def _moment(offset: int, hour: int = 9) -> datetime:
    return datetime.combine(_days(offset), time(hour))


def _insert(conn: Connection, table, row: dict) -> int:
    return db.inserted_id(conn.execute(table.insert().values(row)))


def _organizations() -> list[dict]:
    return [
        {
            "name": "Northwind Traders",
            "website": "northwindtraders.example",
            "industry": "Retail",
            "notes": "Long-standing account, quarterly review meetings.",
        },
        {
            "name": "Acme Manufacturing",
            "website": "acmemfg.example",
            "industry": "Manufacturing",
            "notes": "Met at the spring industry expo.",
        },
        {
            "name": "Bluebird Media",
            "website": "bluebirdmedia.example",
            "industry": "Marketing",
            "notes": "Interested in a retainer for content work.",
        },
        {
            "name": "Cobalt Health",
            "website": "cobalthealth.example",
            "industry": "Healthcare",
            "notes": "Procurement cycle runs long; keep follow-ups tight.",
        },
        {
            "name": "Delta Logistics",
            "website": "deltalogistics.example",
            "industry": "Transport",
            "notes": "Renewal due next quarter.",
        },
        {
            "name": "Evergreen Coffee",
            "website": "evergreencoffee.example",
            "industry": "Hospitality",
            "notes": "Two locations, planning a third.",
        },
    ]


def _contacts(org_ids: dict[str, int]) -> list[dict]:
    rows = [
        (
            "Ana Silva",
            "ana.silva@northwindtraders.example",
            "+1 555 0101",
            "Head of Purchasing",
            "Northwind Traders",
            "customer",
        ),
        (
            "Ben Carter",
            "ben.carter@acmemfg.example",
            "+1 555 0102",
            "Operations Manager",
            "Acme Manufacturing",
            "customer",
        ),
        (
            "Chloe Nguyen",
            "chloe.nguyen@bluebirdmedia.example",
            "+1 555 0103",
            "Marketing Director",
            "Bluebird Media",
            "qualified",
        ),
        (
            "Diego Ramirez",
            "diego.ramirez@cobalthealth.example",
            "+1 555 0104",
            "IT Coordinator",
            "Cobalt Health",
            "qualified",
        ),
        (
            "Emma Wilson",
            "emma.wilson@deltalogistics.example",
            "+1 555 0105",
            "Fleet Manager",
            "Delta Logistics",
            "customer",
        ),
        (
            "Farid Hassan",
            "farid.hassan@evergreencoffee.example",
            "+1 555 0106",
            "Owner",
            "Evergreen Coffee",
            "lead",
        ),
        (
            "Grace Kim",
            "grace.kim@northwindtraders.example",
            "+1 555 0107",
            "Store Manager",
            "Northwind Traders",
            "lead",
        ),
        (
            "Hugo Martins",
            "hugo.martins@acmemfg.example",
            "+1 555 0108",
            "Plant Supervisor",
            "Acme Manufacturing",
            "lead",
        ),
        (
            "Isla Murray",
            "isla.murray@bluebirdmedia.example",
            "+1 555 0109",
            "Content Lead",
            "Bluebird Media",
            "customer",
        ),
        (
            "Jonah Becker",
            "jonah.becker@cobalthealth.example",
            "+1 555 0110",
            "Practice Manager",
            "Cobalt Health",
            "lead",
        ),
        (
            "Keiko Tanaka",
            "keiko.tanaka@deltalogistics.example",
            "+1 555 0111",
            "Dispatch Lead",
            "Delta Logistics",
            "qualified",
        ),
        (
            "Luis Ortega",
            "luis.ortega@evergreencoffee.example",
            "+1 555 0112",
            "Wholesale Buyer",
            "Evergreen Coffee",
            "qualified",
        ),
    ]
    return [
        {
            "name": name,
            "email": email,
            "phone": phone,
            "job_title": job_title,
            "organization_id": org_ids[organization],
            "status": status,
        }
        for name, email, phone, job_title, organization, status in rows
    ]


def _deals(org_ids: dict[str, int], contact_ids: dict[str, int]) -> list[dict]:
    # name, organization, contact, stage, value in cents, close date offset, position
    rows = [
        (
            "Northwind store rollout",
            "Northwind Traders",
            "Ana Silva",
            "Won",
            1_200_000,
            -75,
            0,
        ),
        (
            "Acme line upgrade",
            "Acme Manufacturing",
            "Ben Carter",
            "Won",
            2_450_000,
            -130,
            0,
        ),
        (
            "Evergreen loyalty program",
            "Evergreen Coffee",
            "Luis Ortega",
            "Won",
            480_000,
            -30,
            0,
        ),
        (
            "Bluebird content retainer",
            "Bluebird Media",
            "Chloe Nguyen",
            "Lost",
            900_000,
            -55,
            0,
        ),
        (
            "Delta fleet pilot",
            "Delta Logistics",
            "Emma Wilson",
            "Lost",
            650_000,
            -100,
            0,
        ),
        (
            "Cobalt records migration",
            "Cobalt Health",
            "Diego Ramirez",
            "Negotiation",
            1_800_000,
            8,
            0,
        ),
        (
            "Delta renewal",
            "Delta Logistics",
            "Emma Wilson",
            "Negotiation",
            1_100_000,
            -12,
            1,
        ),
        (
            "Acme spare parts portal",
            "Acme Manufacturing",
            "Hugo Martins",
            "Proposal",
            750_000,
            21,
            0,
        ),
        (
            "Northwind e-commerce add-on",
            "Northwind Traders",
            "Grace Kim",
            "Proposal",
            1_350_000,
            -6,
            1,
        ),
        (
            "Bluebird brand refresh",
            "Bluebird Media",
            "Chloe Nguyen",
            "Qualified",
            620_000,
            38,
            0,
        ),
        (
            "Cobalt patient portal",
            "Cobalt Health",
            "Jonah Becker",
            "Qualified",
            2_100_000,
            52,
            1,
        ),
        (
            "Evergreen wholesale expansion",
            "Evergreen Coffee",
            "Luis Ortega",
            "New",
            300_000,
            65,
            0,
        ),
        (
            "Delta cold-chain tracking",
            "Delta Logistics",
            "Keiko Tanaka",
            "New",
            540_000,
            80,
            1,
        ),
        (
            "Acme safety audit software",
            "Acme Manufacturing",
            "Hugo Martins",
            "New",
            410_000,
            45,
            2,
        ),
    ]
    return [
        {
            "name": name,
            "organization_id": org_ids[organization],
            "contact_id": contact_ids[contact],
            "stage": stage,
            "value_cents": value_cents,
            "probability": STAGE_PROBABILITIES[stage],
            "close_date": _days(close_date_offset),
            "position": position,
        }
        for name, organization, contact, stage, value_cents, close_date_offset, position in rows
    ]


def _activities(contact_ids: dict[str, int], deal_ids: dict[str, int]) -> list[dict]:
    # type, linked to ("contact" or "deal"), key, description, happened offset,
    # follow-up offset (None = no follow-up), done
    rows = [
        (
            "call",
            "deal",
            "Cobalt records migration",
            "Walked through the migration timeline with Diego.",
            -9,
            -2,
            False,
        ),
        (
            "email",
            "contact",
            "Diego Ramirez",
            "Sent the revised scope and pricing for review.",
            -6,
            3,
            False,
        ),
        (
            "note",
            "deal",
            "Delta renewal",
            "Renewal terms approved internally, waiting on signature.",
            -12,
            -1,
            False,
        ),
        (
            "call",
            "contact",
            "Ben Carter",
            "Quarterly check-in; new hires coming on board.",
            -5,
            6,
            False,
        ),
        (
            "note",
            "deal",
            "Northwind e-commerce add-on",
            "Asked for a written estimate before the board meeting.",
            -4,
            None,
            False,
        ),
        (
            "email",
            "contact",
            "Chloe Nguyen",
            "Shared case studies from two retail clients.",
            -7,
            None,
            False,
        ),
        (
            "note",
            "deal",
            "Northwind store rollout",
            "Rollout signed off by the purchasing committee.",
            -74,
            None,
            False,
        ),
        (
            "call",
            "deal",
            "Acme line upgrade",
            "Final walkthrough with the plant supervisor.",
            -129,
            None,
            False,
        ),
        (
            "email",
            "contact",
            "Ana Silva",
            "Sent the renewal summary for the pilot stores.",
            -15,
            -8,
            True,
        ),
        (
            "note",
            "contact",
            "Farid Hassan",
            "Opening a third location next spring.",
            -2,
            None,
            False,
        ),
        (
            "call",
            "contact",
            "Jonah Becker",
            "Intro call; budget confirmed for next year.",
            -3,
            None,
            False,
        ),
        (
            "email",
            "deal",
            "Acme spare parts portal",
            "Pricing sheet delivered to Hugo.",
            -1,
            None,
            False,
        ),
        (
            "note",
            "contact",
            "Emma Wilson",
            "Prefers email over phone for anything urgent.",
            -21,
            None,
            False,
        ),
        (
            "call",
            "deal",
            "Cobalt patient portal",
            "Demo scheduled with the practice managers.",
            -8,
            10,
            False,
        ),
        # Moves the sample boards have been through, so a timeline and the
        # dashboard's recent activity show a stage change of their own.
        (
            "stage_change",
            "deal",
            "Delta renewal",
            "Moved from Qualified to Negotiation",
            -13,
            None,
            True,
        ),
        (
            "stage_change",
            "deal",
            "Cobalt records migration",
            "Moved from Proposal to Negotiation",
            -10,
            None,
            True,
        ),
        (
            "stage_change",
            "deal",
            "Northwind e-commerce add-on",
            "Moved from Qualified to Proposal",
            -8,
            None,
            True,
        ),
        (
            "stage_change",
            "deal",
            "Evergreen loyalty program",
            "Moved from Proposal to Won",
            -29,
            None,
            True,
        ),
    ]
    activity_rows = []
    for (
        activity_type,
        kind,
        key,
        description,
        happened_offset,
        follow_up_offset,
        done,
    ) in rows:
        ids = contact_ids if kind == "contact" else deal_ids
        activity_rows.append(
            {
                "type": activity_type,
                "contact_id": ids[key] if kind == "contact" else None,
                "deal_id": ids[key] if kind == "deal" else None,
                "description": description,
                "happened_at": _moment(happened_offset),
                "follow_up_date": _days(follow_up_offset)
                if follow_up_offset is not None
                else None,
                "done": done,
            }
        )
    return activity_rows


def _clear(engine: Engine) -> None:
    with engine.begin() as conn:
        for table in reversed(db.metadata.sorted_tables):
            conn.execute(table.delete())


def seed(engine: Engine) -> None:
    """Load the sample data. Existing rows are cleared first, so re-seeding is idempotent."""
    _clear(engine)
    with engine.begin() as conn:
        offset = itertools.count()

        def insert_sample(table, row: dict) -> int:
            """One sample row, recorded to a made-up teammate."""
            return _insert(conn, table, {**row, **_attribution(next(offset))})

        org_ids = {
            row["name"]: insert_sample(db.organizations, row)
            for row in _organizations()
        }
        contact_ids = {
            row["name"]: insert_sample(db.contacts, row) for row in _contacts(org_ids)
        }
        deal_ids = {
            row["name"]: insert_sample(db.deals, row)
            for row in _deals(org_ids, contact_ids)
        }
        for row in _activities(contact_ids, deal_ids):
            insert_sample(db.activities, row)
        conn.execute(db.company_settings.insert().values(**_settings_row()))


def create_tables(engine: Engine) -> None:
    db.metadata.create_all(engine)


def is_seeded(engine: Engine) -> bool:
    with engine.connect() as conn:
        count = conn.execute(
            select(func.count()).select_from(db.organizations)
        ).scalar_one()
    return count > 0


def ensure_settings(engine: Engine) -> None:
    """Give a database with no settings row the sample one, and leave a real one alone."""
    with engine.begin() as connection:
        found = connection.execute(
            select(db.company_settings.c.id).where(db.company_settings.c.id == 1)
        ).first()
        if found is None:
            connection.execute(db.company_settings.insert().values(**_settings_row()))


def ensure_seeded(engine: Engine) -> None:
    """Create the tables and load the sample data into an empty database."""
    create_tables(engine)
    repair_links(engine)
    if not is_seeded(engine):
        seed(engine)
    ensure_settings(engine)


def repair_links(engine: Engine) -> None:
    """Clear links that point at records that are no longer there.

    Deleting a contact or an organization used to leave deals and contacts
    behind with ids nothing answers to; this runs on every start, so data
    written before that was fixed never blocks a save.
    """
    with engine.begin() as conn:
        conn.execute(
            db.deals.update()
            .where(
                db.deals.c.contact_id.is_not(None),
                db.deals.c.contact_id.not_in(select(db.contacts.c.id)),
            )
            .values(contact_id=None)
        )
        conn.execute(
            db.contacts.update()
            .where(
                db.contacts.c.organization_id.is_not(None),
                db.contacts.c.organization_id.not_in(select(db.organizations.c.id)),
            )
            .values(organization_id=None)
        )


def reset(engine: Engine) -> None:
    """Drop every table, including the version table, and build again.

    The schema comes back through the migrations, so the version table and
    the schema can't disagree, and prepare() loads the sample data after it.
    """
    tables = inspect(engine).get_table_names()
    with engine.begin() as connection:
        ordered = [
            table.name
            for table in reversed(db.metadata.sorted_tables)
            if table.name in tables
        ]
        ordered += [name for name in tables if name not in ordered]
        for name in ordered:
            connection.execute(text(f'DROP TABLE "{name}"'))
    db.prepare(engine)


def confirm(prompt: str = CONFIRMATION_PROMPT) -> bool:
    return input(prompt).strip().lower() in {"y", "yes"}


def main() -> None:
    if not confirm():
        print("Nothing changed.")
        return
    reset(db.get_engine())
    print("Sample data restored.")


if __name__ == "__main__":
    main()
