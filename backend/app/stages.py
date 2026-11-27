"""The board's move rules, shared by the drag endpoint and accepting a quote.

A move takes the new stage's default probability, lands at the place it is
dropped or at the end of the column, renumbers both columns around it and
writes the system ``stage_change`` entry naming who moved it. One copy, so a
drag and accepting a quote cannot drift apart.
"""

from datetime import datetime

from sqlalchemy import select

from app import db
from app.records import read_or_404, stamp_created


def move(connection, deal_id: int, stage: str, position: int | None, user: str) -> dict:
    """Move a deal to a stage, at a position or the end of the column.

    Returns the deal as it stands after the move.
    """
    deal = read_or_404(connection, db.deals, deal_id, "Deal")
    changed = deal["stage"] != stage

    values = {"stage": stage}
    if changed:
        values["probability"] = db.STAGE_PROBABILITIES[stage]
    target = column_ids(connection, stage, exclude_id=deal_id)
    at = len(target) if position is None else min(position, len(target))
    # The card that moved changed; the cards renumbered around it did not.
    if changed or at != deal["position"]:
        values["updated_by"] = user
    connection.execute(
        db.deals.update().where(db.deals.c.id == deal_id).values(**values)
    )

    target.insert(at, deal_id)
    apply_positions(connection, target)

    if changed:
        source = column_ids(connection, deal["stage"], exclude_id=deal_id)
        apply_positions(connection, source)
        write_stage_entry(connection, deal_id, deal["stage"], stage, user)

    return read_or_404(connection, db.deals, deal_id, "Deal")


def column_ids(connection, stage: str, exclude_id: int | None = None) -> list[int]:
    """The deals in one column, in board order, optionally without one of them."""
    stmt = select(db.deals.c.id).where(db.deals.c.stage == stage)
    if exclude_id is not None:
        stmt = stmt.where(db.deals.c.id != exclude_id)
    stmt = stmt.order_by(db.deals.c.position, db.deals.c.id)
    return list(connection.execute(stmt).scalars())


def apply_positions(connection, ordered_ids: list[int]) -> None:
    for position, column_deal_id in enumerate(ordered_ids):
        connection.execute(
            db.deals.update()
            .where(db.deals.c.id == column_deal_id)
            .values(position=position)
        )


def write_stage_entry(
    connection, deal_id: int, from_stage: str, to_stage: str, user: str
) -> None:
    """The system timeline entry every stage change leaves behind."""
    values = stamp_created(
        {
            "type": "stage_change",
            "contact_id": None,
            "deal_id": deal_id,
            "description": f"Moved from {from_stage} to {to_stage}",
            "happened_at": datetime.now(),
            "follow_up_date": None,
            "done": True,
        },
        user,
    )
    connection.execute(db.activities.insert().values(**values))
