"""Sample data: fills a new database, rebuilds it on reset."""

from __future__ import annotations

import itertools
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from app import db, documents
from app import months as month_buckets
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
        {
            "name": "Fathom Analytics",
            "website": "fathom.example",
            "industry": "Software",
            "notes": "Data team of six; keen on self-serve dashboards.",
        },
        {
            "name": "Granite Works",
            "website": "graniteworks.example",
            "industry": "Construction",
            "notes": "Runs three yards and a growing field crew.",
        },
        {
            "name": "Harbor & Co.",
            "website": "harborco.example",
            "industry": "Legal",
            "notes": "Small practice with a large document archive.",
        },
        {
            "name": "Ironwood Farms",
            "website": "ironwoodfarms.example",
            "industry": "Agriculture",
            "notes": "Seasonal invoicing; needs simple field tools.",
        },
        {
            "name": "Juniper Studios",
            "website": "juniperstudios.example",
            "industry": "Design",
            "notes": "Brand work for retail and hospitality clients.",
        },
        {
            "name": "Keystone Bank",
            "website": "keystonebank.example",
            "industry": "Finance",
            "notes": "Procurement is formal; allow time for review.",
        },
        {
            "name": "Lumen Energy",
            "website": "lumenenergy.example",
            "industry": "Energy",
            "notes": "Facilities team spread across four sites.",
        },
        {
            "name": "Meridian Hotels",
            "website": "meridianhotels.example",
            "industry": "Hospitality",
            "notes": "Eight properties; guest data lives in spreadsheets.",
        },
        {
            "name": "Nimbus Cloud",
            "website": "nimbuscloud.example",
            "industry": "Technology",
            "notes": "Fast-growing platform team; support is the pain point.",
        },
        {
            "name": "Oakline Furniture",
            "website": "oaklinefurniture.example",
            "industry": "Retail",
            "notes": "Wholesale orders arrive by email and phone.",
        },
        {
            "name": "Pinecrest Schools",
            "website": "pinecrestschools.example",
            "industry": "Education",
            "notes": "Three campuses; admin work is centralised.",
        },
        {
            "name": "Quarry Stone",
            "website": "quarrystone.example",
            "industry": "Manufacturing",
            "notes": "Safety reporting is still paper-based.",
        },
        {
            "name": "Vantage Software",
            "website": "vantagesoftware.example",
            "industry": "Software",
            "notes": "Supplies our platform subscription. Bills monthly.",
        },
        {
            "name": "Cedar Contractors",
            "website": "cedarcontractors.example",
            "industry": "Construction",
            "notes": "Contract development and event work, on a monthly retainer.",
        },
        {
            "name": "Riverview Property",
            "website": "riverviewproperty.example",
            "industry": "Real Estate",
            "notes": "Our office landlord. Rent bills on the first of the month.",
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
        (
            "Maya Chen",
            "maya.chen@fathom.example",
            "+1 555 0113",
            "Head of Data",
            "Fathom Analytics",
            "customer",
        ),
        (
            "Noah Patel",
            "noah.patel@graniteworks.example",
            "+1 555 0114",
            "Project Director",
            "Granite Works",
            "qualified",
        ),
        (
            "Olivia Grant",
            "olivia.grant@harborco.example",
            "+1 555 0115",
            "Partner",
            "Harbor & Co.",
            "customer",
        ),
        (
            "Pablo Ruiz",
            "pablo.ruiz@ironwoodfarms.example",
            "+1 555 0116",
            "Operations Lead",
            "Ironwood Farms",
            "lead",
        ),
        (
            "Quinn Harper",
            "quinn.harper@juniperstudios.example",
            "+1 555 0117",
            "Creative Director",
            "Juniper Studios",
            "customer",
        ),
        (
            "Rosa Delgado",
            "rosa.delgado@keystonebank.example",
            "+1 555 0118",
            "Procurement Manager",
            "Keystone Bank",
            "qualified",
        ),
        (
            "Sam Okafor",
            "sam.okafor@lumenenergy.example",
            "+1 555 0119",
            "Facilities Head",
            "Lumen Energy",
            "customer",
        ),
        (
            "Tara Singh",
            "tara.singh@meridianhotels.example",
            "+1 555 0120",
            "Regional Manager",
            "Meridian Hotels",
            "lead",
        ),
        (
            "Uma Brooks",
            "uma.brooks@nimbuscloud.example",
            "+1 555 0121",
            "VP Engineering",
            "Nimbus Cloud",
            "customer",
        ),
        (
            "Victor Lang",
            "victor.lang@oaklinefurniture.example",
            "+1 555 0122",
            "Buyer",
            "Oakline Furniture",
            "qualified",
        ),
        (
            "Wendy Cole",
            "wendy.cole@pinecrestschools.example",
            "+1 555 0123",
            "Business Manager",
            "Pinecrest Schools",
            "lead",
        ),
        (
            "Xavier Reed",
            "xavier.reed@quarrystone.example",
            "+1 555 0124",
            "Plant Manager",
            "Quarry Stone",
            "customer",
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
            0,
            0,
        ),
        (
            "Acme line upgrade",
            "Acme Manufacturing",
            "Ben Carter",
            "Won",
            2_450_000,
            -30,
            0,
        ),
        (
            "Evergreen loyalty program",
            "Evergreen Coffee",
            "Luis Ortega",
            "Won",
            480_000,
            -61,
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
        # A year of won work, one deal a month, so invoices and quotes have a
        # won deal to attach to in every month of the last 12.
        (
            "Fathom dashboard rollout",
            "Fathom Analytics",
            "Maya Chen",
            "Won",
            1_650_000,
            -91,
            0,
        ),
        (
            "Granite inventory system",
            "Granite Works",
            "Noah Patel",
            "Won",
            2_100_000,
            -122,
            0,
        ),
        (
            "Harbor document suite",
            "Harbor & Co.",
            "Olivia Grant",
            "Won",
            980_000,
            -152,
            0,
        ),
        (
            "Ironwood field app",
            "Ironwood Farms",
            "Pablo Ruiz",
            "Won",
            760_000,
            -183,
            0,
        ),
        (
            "Juniper brand portal",
            "Juniper Studios",
            "Quinn Harper",
            "Won",
            1_420_000,
            -213,
            0,
        ),
        (
            "Keystone compliance hub",
            "Keystone Bank",
            "Rosa Delgado",
            "Won",
            3_200_000,
            -244,
            0,
        ),
        (
            "Lumen site analytics",
            "Lumen Energy",
            "Sam Okafor",
            "Won",
            1_900_000,
            -274,
            0,
        ),
        (
            "Meridian guest CRM",
            "Meridian Hotels",
            "Tara Singh",
            "Won",
            2_650_000,
            -305,
            0,
        ),
        (
            "Nimbus support desk",
            "Nimbus Cloud",
            "Uma Brooks",
            "Won",
            1_150_000,
            -335,
            0,
        ),
        # Work in flight for quotes and bills to sit beside.
        (
            "Oakline order portal",
            "Oakline Furniture",
            "Victor Lang",
            "Negotiation",
            880_000,
            18,
            2,
        ),
        (
            "Pinecrest admin suite",
            "Pinecrest Schools",
            "Wendy Cole",
            "Negotiation",
            1_250_000,
            40,
            3,
        ),
        (
            "Quarry safety portal",
            "Quarry Stone",
            "Xavier Reed",
            "Proposal",
            1_600_000,
            27,
            2,
        ),
        (
            "Fathom data warehouse",
            "Fathom Analytics",
            "Maya Chen",
            "Proposal",
            2_300_000,
            55,
            3,
        ),
        (
            "Harbor contract review",
            "Harbor & Co.",
            "Olivia Grant",
            "Qualified",
            640_000,
            34,
            2,
        ),
        (
            "Nimbus migration",
            "Nimbus Cloud",
            "Uma Brooks",
            "Qualified",
            1_950_000,
            48,
            3,
        ),
        (
            "Juniper retainer",
            "Juniper Studios",
            "Quinn Harper",
            "New",
            540_000,
            70,
            3,
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


def _products() -> list[dict]:
    # name, description, price in cents, active
    rows = [
        (
            "Starter license",
            "A single-team plan with the core CRM features.",
            4_900,
            True,
        ),
        (
            "Team license",
            "Per-seat license for a growing sales team.",
            19_900,
            True,
        ),
        (
            "Priority support",
            "Same-day replies and a dedicated support channel.",
            14_950,
            True,
        ),
        (
            "Annual support plan",
            "A year of support with quarterly check-ins.",
            240_000,
            True,
        ),
        (
            "Onsite training day",
            "On-site training for up to twelve people.",
            120_000,
            True,
        ),
        (
            "Remote training day",
            "A full day of remote training for the team.",
            75_000,
            True,
        ),
        (
            "Implementation package",
            "Guided setup, data import and a launch review.",
            250_000,
            True,
        ),
        (
            "Data migration",
            "Move records from a legacy CRM into Accountable.",
            180_000,
            True,
        ),
        (
            "Custom report",
            "A report built to your specification.",
            65_000,
            True,
        ),
        (
            "API access",
            "Programmatic access to your Accountable data.",
            9_900,
            True,
        ),
        (
            "Legacy add-on",
            "An older add-on kept for existing contracts.",
            3_900,
            False,
        ),
        (
            "Pilot license",
            "A short pilot for one team, before a full license.",
            0,
            False,
        ),
    ]
    return [
        {
            "name": name,
            "description": description,
            "price_cents": price_cents,
            "active": active,
        }
        for name, description, price_cents, active in rows
    ]


def _quotes(deal_ids: dict[str, int]) -> list[dict]:
    """The sample quotes, numbered in the order they were created.

    The open Proposal and Negotiation deals carry the live offers — drafts,
    sent ones, two gone past their date and one declined — and every deal won
    in the last months carries the accepted quote that won it, its subtotal
    rounding to the deal's value. Each row keeps its lines beside it;
    _quote_lines turns them into rows.
    """
    # deal name, status, created offset, [(product, quantity) or
    # (product, quantity, description)]
    rows = [
        (
            "Fathom dashboard rollout",
            "accepted",
            -100,
            [
                ("Annual support plan", 3),
                ("Data migration", 3),
                ("Onsite training day", 2),
                ("Remote training day", 2),
            ],
        ),
        (
            "Evergreen loyalty program",
            "accepted",
            -70,
            [("Data migration", 2), ("Onsite training day", 1)],
        ),
        (
            "Acme line upgrade",
            "accepted",
            -40,
            [
                ("Implementation package", 4),
                ("Annual support plan", 4),
                ("Data migration", 2),
                ("Custom report", 2),
            ],
        ),
        (
            "Quarry safety portal",
            "sent",
            -50,
            [
                ("Implementation package", 2),
                ("Onsite training day", 1),
                ("Annual support plan", 1),
            ],
        ),
        (
            "Northwind e-commerce add-on",
            "sent",
            -45,
            [
                ("Team license", 4),
                ("Priority support", 1),
                ("API access", 2, "Sandbox keys for the pilot storefront."),
            ],
        ),
        (
            "Fathom data warehouse",
            "declined",
            -25,
            [("Data migration", 2), ("Custom report", 2), ("API access", 1)],
        ),
        (
            "Acme spare parts portal",
            "sent",
            -12,
            [("API access", 3), ("Starter license", 2), ("Team license", 1)],
        ),
        (
            "Pinecrest admin suite",
            "sent",
            -9,
            [
                ("Team license", 5),
                ("Remote training day", 2),
                ("Annual support plan", 1),
            ],
        ),
        (
            "Northwind store rollout",
            "accepted",
            -8,
            [
                ("Data migration", 2),
                ("Annual support plan", 1),
                ("Onsite training day", 5),
            ],
        ),
        (
            "Cobalt records migration",
            "sent",
            -6,
            [
                ("Data migration", 2, "Historic case records, in two passes."),
                ("Implementation package", 1),
                ("Custom report", 1),
            ],
        ),
        (
            "Delta renewal",
            "draft",
            -2,
            [("Annual support plan", 2), ("Priority support", 1)],
        ),
        (
            "Oakline order portal",
            "draft",
            -1,
            [
                ("Implementation package", 1),
                ("Data migration", 1),
                ("Onsite training day", 1),
            ],
        ),
    ]
    settings = _settings_row()
    prefix = settings["quote_prefix"] or ""
    numbered = sorted(rows, key=lambda row: row[2])
    return [
        {
            "number": f"{prefix}{index:0{documents.DIGITS}d}",
            "deal_id": deal_ids[deal],
            "status": status,
            "created_at": _days(offset),
            "valid_until": _days(offset + 30),
            # A draft reads its tax from the settings; the rest kept the tax
            # they were sent with.
            "tax_label": None if status == "draft" else settings["tax_label"],
            "tax_rate_thousandths": (
                None if status == "draft" else settings["tax_rate_thousandths"]
            ),
            "lines": lines,
        }
        for index, (deal, status, offset, lines) in enumerate(numbered, start=1)
    ]


def _quote_lines(lines: list[tuple], product_ids: dict[str, int]) -> list[dict]:
    """One quote's lines, taking each product's name and price as they stand."""
    catalog = {row["name"]: row for row in _products()}
    rows = []
    for position, line in enumerate(lines):
        name, quantity, *description = line
        product = catalog[name]
        rows.append(
            {
                "product_id": product_ids[name],
                "product_name": product["name"],
                "description": (
                    description[0] if description else product["description"]
                ),
                "quantity": quantity,
                "unit_price_cents": product["price_cents"],
                "position": position,
            }
        )
    return rows


def _bills(org_ids: dict[str, int]) -> list[dict]:
    """A year of supplier bills: a monthly bill from each of the three
    suppliers, a few large one-offs, most paid with their paid days spread
    across the twelve months so every month of the spending chart has bars,
    a few waiting unpaid and a few overdue. Every category is used.
    """
    today = date.today()
    starts = month_buckets.last_month_starts(today)
    rows: list[dict] = []

    def bill(
        supplier,
        number,
        bill_date,
        category,
        amount_cents,
        tax_cents,
        notes,
        paid_date=None,
    ):
        rows.append(
            {
                "organization_id": org_ids[supplier],
                "bill_number": number,
                "bill_date": bill_date,
                "due_date": bill_date + timedelta(days=30),
                "category": category,
                "amount_cents": amount_cents,
                "tax_cents": tax_cents,
                "total_cents": amount_cents + tax_cents,
                "notes": notes,
                "paid_date": paid_date,
            }
        )

    for start in starts:
        year, month = start.year, start.month
        billed = min(start + timedelta(days=2), today)
        bill(
            "Vantage Software",
            f"VS-{year}-{month:02d}",
            billed,
            "Software",
            24_900,
            1_992,
            "Monthly platform subscription.",
            paid_date=min(start + timedelta(days=6), today),
        )
        bill(
            "Riverview Property",
            f"RP-{year}-{month:02d}",
            min(start + timedelta(days=1), today),
            "Office",
            85_000,
            6_800,
            "Office rent.",
            paid_date=min(start + timedelta(days=4), today),
        )
        # Every retainer but this month's is paid; the current one waits.
        bill(
            "Cedar Contractors",
            f"CC-{year}-{month:02d}",
            billed,
            "Contractors",
            60_000,
            4_800,
            "Monthly support retainer.",
            paid_date=(
                None if start == starts[-1] else min(start + timedelta(days=8), today)
            ),
        )

    def one_off(
        supplier,
        number,
        months_back,
        billed_day,
        paid_day,
        category,
        amount,
        tax,
        notes,
    ):
        start = starts[len(starts) - 1 - months_back]
        bill(
            supplier,
            number,
            start + timedelta(days=billed_day),
            category,
            amount,
            tax,
            notes,
            paid_date=start + timedelta(days=paid_day),
        )

    # The occasional large one-off, each paid in its own month.
    one_off(
        "Vantage Software",
        f"VS-{starts[3].year}-LIC",
        8,
        10,
        15,
        "Software",
        2_400_000,
        192_000,
        "Annual platform license.",
    )
    one_off(
        "Cedar Contractors",
        f"CC-{starts[6].year}-FIT",
        5,
        12,
        18,
        "Contractors",
        1_250_000,
        100_000,
        "Warehouse fit-out.",
    )
    one_off(
        "Riverview Property",
        f"RP-{starts[8].year}-HVAC",
        3,
        9,
        14,
        "Office",
        640_000,
        51_200,
        "Air conditioning replacement.",
    )
    one_off(
        "Cedar Contractors",
        f"CC-{starts[4].year}-EXPO",
        7,
        11,
        16,
        "Marketing",
        95_000,
        7_600,
        "Expo stand materials.",
    )
    one_off(
        "Cedar Contractors",
        f"CC-{starts[9].year}-TRIP",
        2,
        8,
        13,
        "Travel",
        64_000,
        5_120,
        "Site survey travel.",
    )
    one_off(
        "Riverview Property",
        f"RP-{starts[2].year}-FEE",
        9,
        7,
        12,
        "Other",
        55_000,
        4_400,
        "Building service charge.",
    )

    # Bills still waiting: some due within the month, a few overdue.
    bill(
        "Vantage Software",
        f"VS-{_days(-12).year}-SEATS",
        _days(-12),
        "Software",
        32_000,
        2_560,
        "Extra seats for the support team.",
    )
    bill(
        "Cedar Contractors",
        f"CC-{_days(-5).year}-TRV",
        _days(-5),
        "Travel",
        128_000,
        10_240,
        "Site visit travel.",
    )
    bill(
        "Cedar Contractors",
        f"CC-{_days(-75).year}-SHOW",
        _days(-75),
        "Marketing",
        95_000,
        7_600,
        "Trade show stand.",
    )
    bill(
        "Riverview Property",
        f"RP-{_days(-60).year}-INS",
        _days(-60),
        "Other",
        48_000,
        3_840,
        "Building insurance.",
    )
    bill(
        "Riverview Property",
        f"RP-{_days(-40).year}-LIFT",
        _days(-40),
        "Office",
        22_000,
        1_760,
        "Lift maintenance.",
    )
    return rows


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
        product_ids = {
            row["name"]: insert_sample(db.products, row) for row in _products()
        }
        quotes = _quotes(deal_ids)
        for quote in quotes:
            lines = quote.pop("lines")
            quote_id = insert_sample(db.quotes, quote)
            for line in _quote_lines(lines, product_ids):
                _insert(conn, db.quote_lines, {"quote_id": quote_id, **line})
        # The counter sits at the sample's last number, so the next real quote
        # continues the sequence instead of colliding with it.
        conn.execute(
            db.number_counters.insert().values(kind="quote", last_number=len(quotes))
        )
        for row in _bills(org_ids):
            insert_sample(db.bills, row)


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
