"""Dashboard aggregations: month buckets, pipeline totals, follow-ups split,
what customers owe and what the business owes its suppliers.

Every figure the dashboard shows is computed here, against one connection, so
the numbers on screen can't drift apart. Per-deal expected revenue is
``value_cents * probability // 100`` — floored in cents, the same way the
frontend computes it, so both sides always agree. Bill status comes from the
one ``bill_status`` helper the bills routes share.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import TypedDict

from sqlalchemy import and_, func, select

from app import db, invoice_state
from app import months as month_buckets
from app.routes.bills import CATEGORIES, bill_status

OPEN_STAGES = ("New", "Qualified", "Proposal", "Negotiation")
RECENT_ACTIVITY_LIMIT = 8
DUE_WINDOW_DAYS = 30


class MonthTotal(TypedDict):
    month: str
    revenue_cents: int
    deals: int


def expected_revenue(value_cents: int, probability: int) -> int:
    return (value_cents * probability) // 100


def won_summary(conn, today: date | None = None) -> dict:
    """Won count and revenue bucketed into the last 12 calendar months.

    A deal won before its expected close date still counts: its close date is
    capped at ``today`` for bucketing, so it lands in the current month instead
    of disappearing from every figure.
    """
    today = today or date.today()
    starts = month_buckets.last_month_starts(today)
    lower = starts[0]
    rows = conn.execute(
        select(db.deals.c.value_cents, db.deals.c.close_date).where(
            and_(
                db.deals.c.stage == "Won",
                db.deals.c.close_date.is_not(None),
                db.deals.c.close_date >= lower,
            )
        )
    ).all()

    buckets = {start: {"revenue_cents": 0, "deals": 0} for start in starts}
    for value_cents, close_date in rows:
        capped = min(close_date, today)
        bucket = buckets[date(capped.year, capped.month, 1)]
        bucket["revenue_cents"] += value_cents
        bucket["deals"] += 1

    months: list[MonthTotal] = [
        {
            "month": start.strftime("%Y-%m"),
            "revenue_cents": buckets[start]["revenue_cents"],
            "deals": buckets[start]["deals"],
        }
        for start in sorted(buckets)
    ]
    return {
        "months": months,
        "total_revenue_cents": sum(month["revenue_cents"] for month in months),
        "total_deals": sum(month["deals"] for month in months),
    }


def pipeline_totals(conn) -> dict:
    """Value, expected revenue and count of the deals still open."""
    row = conn.execute(
        select(
            func.coalesce(func.sum(db.deals.c.value_cents), 0),
            func.coalesce(func.count(db.deals.c.id), 0),
        ).where(db.deals.c.stage.in_(OPEN_STAGES))
    ).one()
    value_cents, count = int(row[0]), int(row[1])

    expected = conn.execute(
        select(db.deals.c.value_cents, db.deals.c.probability).where(
            db.deals.c.stage.in_(OPEN_STAGES)
        )
    ).all()
    expected_cents = sum(
        expected_revenue(value, probability) for value, probability in expected
    )
    return {
        "value_cents": value_cents,
        "expected_cents": expected_cents,
        "count": count,
    }


def column_totals(conn) -> dict:
    """Value, expected revenue and count per stage — all six columns."""
    totals: dict[str, dict] = {}
    for stage in db.STAGE_PROBABILITIES:
        rows = conn.execute(
            select(db.deals.c.value_cents, db.deals.c.probability).where(
                db.deals.c.stage == stage
            )
        ).all()
        totals[stage] = {
            "count": len(rows),
            "value_cents": sum(value for value, _ in rows),
            "expected_cents": sum(
                expected_revenue(value, probability) for value, probability in rows
            ),
        }
    return totals


def funnel(conn, today: date | None = None) -> dict:
    """Open deals by stage, plus the won (12 months) and lost chips."""
    today = today or date.today()
    stages = []
    for stage in OPEN_STAGES:
        rows = conn.execute(
            select(db.deals.c.value_cents, db.deals.c.probability).where(
                db.deals.c.stage == stage
            )
        ).all()
        stages.append(
            {
                "stage": stage,
                "count": len(rows),
                "value_cents": sum(value for value, _ in rows),
                "expected_cents": sum(
                    expected_revenue(value, probability) for value, probability in rows
                ),
            }
        )

    won = won_summary(conn, today)
    lost = conn.execute(
        select(
            func.coalesce(func.sum(db.deals.c.value_cents), 0),
            func.count(db.deals.c.id),
        ).where(db.deals.c.stage == "Lost")
    ).one()

    return {
        "stages": stages,
        "won_12m_cents": won["total_revenue_cents"],
        "won_12m_count": won["total_deals"],
        "lost_cents": int(lost[0]),
        "lost_count": int(lost[1]),
    }


def recent_activity(conn, limit: int = RECENT_ACTIVITY_LIMIT) -> list[dict]:
    """Latest activities across all records, stage changes included, newest first."""
    rows = conn.execute(
        select(db.activities)
        .order_by(db.activities.c.happened_at.desc(), db.activities.c.id.desc())
        .limit(limit)
    ).mappings()
    return [dict(row) for row in rows]


def follow_ups(conn, today: date | None = None) -> dict:
    """Open follow-ups split into overdue and upcoming, soonest first."""
    today = today or date.today()
    rows = conn.execute(
        select(db.activities)
        .where(
            and_(
                db.activities.c.follow_up_date.is_not(None),
                db.activities.c.done.is_(False),
            )
        )
        .order_by(db.activities.c.follow_up_date.asc(), db.activities.c.id.asc())
    ).mappings()

    overdue, upcoming = [], []
    for row in rows:
        if row["follow_up_date"] < today:
            overdue.append(dict(row))
        else:
            upcoming.append(dict(row))

    return {
        "overdue": overdue,
        "upcoming": upcoming,
        "overdue_count": len(overdue),
        "open_count": len(overdue) + len(upcoming),
    }


def payments_by_month(conn, today: date | None = None) -> list[dict]:
    """What arrived in each of the last 12 months, by the day it landed."""
    today = today or date.today()
    starts = month_buckets.last_month_starts(today)
    rows = conn.execute(
        select(db.payments.c.paid_on, db.payments.c.amount_cents).where(
            db.payments.c.paid_on >= starts[0]
        )
    ).all()

    totals = {month_buckets.month_key(start): 0 for start in starts}
    for paid_on, amount_cents in rows:
        key = month_buckets.month_key(paid_on)
        if key in totals:
            totals[key] += int(amount_cents)
    return [
        {
            "month": month_buckets.month_key(start),
            "cents": totals[month_buckets.month_key(start)],
        }
        for start in starts
    ]


def money_summary(conn, today: date | None = None) -> dict:
    """What customers owe, how late it is, and what arrived by month.

    Only issued invoices are owed: drafts and void invoices are left out, and
    a fully paid invoice adds nothing to the aging. Overdue means still owed
    after the due date — an invoice due today is not yet due.
    """
    today = today or date.today()
    invoices = conn.execute(
        select(
            db.invoices.c.id,
            db.invoices.c.total_cents,
            db.invoices.c.due_date,
        ).where(db.invoices.c.status == invoice_state.ISSUED)
    ).all()
    paid = dict(
        conn.execute(
            select(
                db.payments.c.invoice_id,
                func.coalesce(func.sum(db.payments.c.amount_cents), 0),
            ).group_by(db.payments.c.invoice_id)
        ).all()
    )

    owed_cents = 0
    overdue_cents = 0
    buckets = {name: 0 for name in invoice_state.AGING_BUCKETS}
    for invoice_id, total_cents, due_date in invoices:
        remaining = invoice_state.balance(
            int(total_cents or 0), int(paid.get(invoice_id, 0))
        )
        if remaining <= 0:
            continue
        owed_cents += remaining
        if due_date is None:
            buckets[invoice_state.NOT_YET_DUE] += remaining
            continue
        buckets[invoice_state.aging_bucket(due_date, today)] += remaining
        if due_date < today:
            overdue_cents += remaining

    return {
        "owed_cents": owed_cents,
        "overdue_cents": overdue_cents,
        "aging": [
            {"bucket": name, "cents": buckets[name]}
            for name in invoice_state.AGING_BUCKETS
        ],
        "payments": payments_by_month(conn, today),
    }


def _money(rows) -> dict:
    """The total and count of a window of bills, tax included."""
    return {
        "total_cents": sum(row["total_cents"] for row in rows),
        "count": len(rows),
    }


def spending(conn, today: date | None = None) -> list[dict]:
    """Each paid bill's total in the month it was paid, per category, over the
    same 12 buckets the sales charts use. Unpaid bills are in no bar."""
    today = today or date.today()
    starts = month_buckets.last_month_starts(today)
    lower = starts[0]
    buckets = {start: dict.fromkeys(CATEGORIES, 0) for start in starts}
    rows = conn.execute(
        select(db.bills.c.category, db.bills.c.total_cents, db.bills.c.paid_date).where(
            db.bills.c.paid_date.is_not(None)
        )
    ).all()
    for category, total_cents, paid_date in rows:
        capped = min(paid_date, today)
        if capped < lower:
            continue
        bucket = buckets[date(capped.year, capped.month, 1)]
        bucket[category] = bucket.get(category, 0) + total_cents
    return [
        {"month": start.strftime("%Y-%m"), "categories": dict(buckets[start])}
        for start in sorted(buckets)
    ]


def payables(conn, today: date | None = None) -> dict:
    """What the business owes its suppliers: the payables half of the Money
    section. "Bills to pay" is every bill not yet paid; "Overdue" and "Due in
    the next 30 days" are its windows. A paid bill is in none of them."""
    today = today or date.today()
    rows = (
        conn.execute(
            select(db.bills, db.organizations.c.name.label("supplier")).select_from(
                db.bills.join(
                    db.organizations,
                    db.bills.c.organization_id == db.organizations.c.id,
                )
            )
        )
        .mappings()
        .all()
    )
    unpaid = [row for row in rows if bill_status(row, today) != "paid"]
    overdue = [row for row in unpaid if row["due_date"] < today]
    horizon = today + timedelta(days=DUE_WINDOW_DAYS)
    due_soon = sorted(
        (row for row in unpaid if today <= row["due_date"] <= horizon),
        key=lambda row: (row["due_date"], row["id"]),
    )
    return {
        "unpaid": _money(unpaid),
        "overdue": _money(overdue),
        "due_soon": {
            **_money(due_soon),
            "rows": [
                {
                    "supplier": row["supplier"],
                    "due_date": row["due_date"],
                    "total_cents": row["total_cents"],
                }
                for row in due_soon
            ],
        },
        "spending": spending(conn, today),
    }


def dashboard_payload(conn, today: date | None = None) -> dict:
    """Everything the dashboard shows, in one round trip."""
    today = today or date.today()
    return {
        "won": won_summary(conn, today),
        "pipeline": pipeline_totals(conn),
        "funnel": funnel(conn, today),
        "money": money_summary(conn, today),
        "recent_activity": recent_activity(conn),
        "follow_ups": follow_ups(conn, today),
        "payables": payables(conn, today),
    }
