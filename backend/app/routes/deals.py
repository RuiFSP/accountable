from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import auth, db, stats
from app.records import read_or_404, require_exists, stamp_created, stamp_updated

router = APIRouter(prefix="/api/deals", tags=["deals"])

Stage = Literal["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
SortField = Literal[
    "id",
    "name",
    "stage",
    "value_cents",
    "close_date",
    "organization_name",
    "contact_name",
]
SortOrder = Literal["asc", "desc"]


class DealIn(BaseModel):
    name: str = Field(min_length=1)
    organization_id: int
    # A deal keeps its organization; its main contact is optional, because a
    # contact can be deleted on its own.
    contact_id: int | None = None
    stage: Stage = "New"
    value_cents: int = Field(ge=0)
    probability: int = Field(ge=0, le=100)
    close_date: date | None = None
    position: int | None = Field(default=None, ge=0)


class StageMoveIn(BaseModel):
    stage: Stage
    position: int = Field(ge=0)


def _base_stmt():
    return (
        select(db.deals)
        .join(
            db.organizations,
            db.deals.c.organization_id == db.organizations.c.id,
            isouter=True,
        )
        .join(db.contacts, db.deals.c.contact_id == db.contacts.c.id, isouter=True)
    )


@router.get("")
def list_deals(
    q: str | None = None,
    stage: Stage | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    stmt = _base_stmt()
    if q:
        stmt = stmt.where(db.deals.c.name.like(f"%{q}%"))
    if stage:
        stmt = stmt.where(db.deals.c.stage == stage)
    order_columns = {
        "organization_name": db.organizations.c.name,
        "contact_name": db.contacts.c.name,
    }
    if sort in order_columns:
        order_column = order_columns[sort]
    else:
        order_column = db.deals.c[sort]
    stmt = stmt.order_by(
        order_column.desc() if order == "desc" else order_column.asc(), db.deals.c.id
    )
    with db.get_engine().connect() as connection:
        rows = connection.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_deal(payload: DealIn, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        values = payload.model_dump()
        require_exists(
            connection, db.organizations, values["organization_id"], "Organization"
        )
        if values["contact_id"] is not None:
            require_exists(connection, db.contacts, values["contact_id"], "Contact")
        if values["position"] is None:
            highest = connection.execute(
                select(func.coalesce(func.max(db.deals.c.position), -1)).where(
                    db.deals.c.stage == values["stage"]
                )
            ).scalar_one()
            values["position"] = highest + 1
        values = stamp_created(values, user)
        result = connection.execute(db.deals.insert().values(**values))
        deal_id = db.inserted_id(result)
        return read_or_404(connection, db.deals, deal_id, "Deal")


@router.put("/{deal_id}")
def update_deal(
    deal_id: int, payload: DealIn, user: str = Depends(auth.current_user)
) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.deals, deal_id, "Deal")
        values = payload.model_dump()
        require_exists(
            connection, db.organizations, values["organization_id"], "Organization"
        )
        if values["contact_id"] is not None:
            require_exists(connection, db.contacts, values["contact_id"], "Contact")

        stage_changed = existing["stage"] != values["stage"]
        if stage_changed:
            # The edit form has no placement, so a stage change through it
            # behaves like a move to the end of the new column: the stage's
            # default probability and a timeline entry, same as the drag.
            values["probability"] = db.STAGE_PROBABILITIES[values["stage"]]
            target = _column_ids(connection, values["stage"], exclude_id=deal_id)
            values["position"] = len(target)
        elif values["position"] is None:
            values["position"] = existing["position"]

        values = stamp_updated(existing, values, user)

        connection.execute(
            db.deals.update().where(db.deals.c.id == deal_id).values(**values)
        )

        if stage_changed:
            target.append(deal_id)
            _apply_positions(connection, target)
            source = _column_ids(connection, existing["stage"], exclude_id=deal_id)
            _apply_positions(connection, source)
            _write_stage_entry(
                connection, deal_id, existing["stage"], values["stage"], user
            )

        return read_or_404(connection, db.deals, deal_id, "Deal")


@router.post("/{deal_id}/stage")
def move_deal_stage(
    deal_id: int, payload: StageMoveIn, user: str = Depends(auth.current_user)
) -> dict:
    """Move a card between or within columns: stage, probability, position.

    A stage change resets the probability to the new stage's default and writes
    a system ``stage_change`` entry into the deal's timeline. Positions are
    renumbered in the affected column(s) so a dropped card keeps its slot.
    """
    with db.get_engine().begin() as connection:
        deal = read_or_404(connection, db.deals, deal_id, "Deal")
        changed = deal["stage"] != payload.stage

        values = {"stage": payload.stage}
        if changed:
            values["probability"] = db.STAGE_PROBABILITIES[payload.stage]
        target = _column_ids(connection, payload.stage, exclude_id=deal_id)
        position = min(payload.position, len(target))
        # The card that moved changed; the cards renumbered around it did not.
        if changed or position != deal["position"]:
            values["updated_by"] = user
        connection.execute(
            db.deals.update().where(db.deals.c.id == deal_id).values(**values)
        )

        target.insert(position, deal_id)
        _apply_positions(connection, target)

        if changed:
            source = _column_ids(connection, deal["stage"], exclude_id=deal_id)
            _apply_positions(connection, source)
            _write_stage_entry(connection, deal_id, deal["stage"], payload.stage, user)

        return {
            "deal": read_or_404(connection, db.deals, deal_id, "Deal"),
            "totals": {
                "board": stats.pipeline_totals(connection),
                "columns": stats.column_totals(connection),
            },
        }


@router.delete("/{deal_id}")
def delete_deal(deal_id: int) -> dict:
    with db.get_engine().begin() as connection:
        read_or_404(connection, db.deals, deal_id, "Deal")
        activities = (
            connection.execute(
                select(db.activities.c.description)
                .where(db.activities.c.deal_id == deal_id)
                .order_by(db.activities.c.id)
            )
            .scalars()
            .all()
        )
        connection.execute(
            db.activities.delete().where(db.activities.c.deal_id == deal_id)
        )
        connection.execute(db.deals.delete().where(db.deals.c.id == deal_id))

    return {"activities": list(activities), "counts": {"activities": len(activities)}}


def _write_stage_entry(
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


def _column_ids(connection, stage: str, exclude_id: int | None = None) -> list[int]:
    stmt = select(db.deals.c.id).where(db.deals.c.stage == stage)
    if exclude_id is not None:
        stmt = stmt.where(db.deals.c.id != exclude_id)
    stmt = stmt.order_by(db.deals.c.position, db.deals.c.id)
    return list(connection.execute(stmt).scalars())


def _apply_positions(connection, ordered_ids: list[int]) -> None:
    for position, column_deal_id in enumerate(ordered_ids):
        connection.execute(
            db.deals.update()
            .where(db.deals.c.id == column_deal_id)
            .values(position=position)
        )
