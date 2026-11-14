"""Dashboard aggregations: month buckets, pipeline totals, follow-ups split.

Every figure the dashboard shows is computed here, against one connection, so
the numbers on screen can't drift apart. Per-deal expected revenue is
``value_cents * probability // 100`` — floored in cents, the same way the
frontend computes it, so both sides always agree.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import and_, func, select

from app import db

OPEN_STAGES = ("New", "Qualified", "Proposal", "Negotiation")
RECENT_ACTIVITY_LIMIT = 8


def expected_revenue(value_cents: int, probability: int) -> int:
    return (value_cents * probability) // 100


def _month_starts(today: date, count: int = 12) -> list[date]:
    starts = []
    year, month = today.year, today.month
    for _ in range(count):
        starts.append(date(year, month, 1))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(starts))


def won_summary(conn, today: date | None = None) -> dict:
    """Won count and revenue bucketed into the last 12 calendar months.

    A deal won before its expected close date still counts: its close date is
    capped at ``today`` for bucketing, so it lands in the current month instead
    of disappearing from every figure.
    """
    today = today or date.today()
    lower = _month_starts(today)[0]
    rows = conn.execute(
        select(db.deals.c.value_cents, db.deals.c.close_date).where(
            and_(
                db.deals.c.stage == "Won",
                db.deals.c.close_date.is_not(None),
                db.deals.c.close_date >= lower,
            )
        )
    ).all()

    buckets = {start: {"revenue_cents": 0, "deals": 0} for start in _month_starts(today)}
    for value_cents, close_date in rows:
        capped = min(close_date, today)
        bucket = buckets[date(capped.year, capped.month, 1)]
        bucket["revenue_cents"] += value_cents
        bucket["deals"] += 1

    months = [
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
    expected_cents = sum(expected_revenue(value, probability) for value, probability in expected)
    return {"value_cents": value_cents, "expected_cents": expected_cents, "count": count}


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
        select(func.coalesce(func.sum(db.deals.c.value_cents), 0), func.count(db.deals.c.id)).where(
            db.deals.c.stage == "Lost"
        )
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


def dashboard_payload(conn, today: date | None = None) -> dict:
    """Everything the dashboard shows, in one round trip."""
    today = today or date.today()
    return {
        "won": won_summary(conn, today),
        "pipeline": pipeline_totals(conn),
        "funnel": funnel(conn, today),
        "recent_activity": recent_activity(conn),
        "follow_ups": follow_ups(conn, today),
    }
