from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import db

router = APIRouter(prefix="/api/deals", tags=["deals"])

Stage = Literal["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
SortField = Literal[
    "id", "name", "stage", "value_cents", "close_date", "organization_name", "contact_name"
]
SortOrder = Literal["asc", "desc"]


class DealIn(BaseModel):
    name: str = Field(min_length=1)
    organization_id: int
    contact_id: int
    stage: Stage = "New"
    value_cents: int = Field(ge=0)
    probability: int = Field(ge=0, le=100)
    close_date: date | None = None
    position: int | None = Field(default=None, ge=0)


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


def _read(conn, deal_id: int) -> dict:
    row = conn.execute(select(db.deals).where(db.deals.c.id == deal_id)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return dict(row)


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
        rows = connection.execute(stmt).mappings()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_deal(payload: DealIn) -> dict:
    with db.get_engine().begin() as connection:
        values = payload.model_dump()
        _require_exists(connection, db.organizations, values["organization_id"], "Organization")
        _require_exists(connection, db.contacts, values["contact_id"], "Contact")
        if values["position"] is None:
            highest = connection.execute(
                select(func.coalesce(func.max(db.deals.c.position), -1)).where(
                    db.deals.c.stage == values["stage"]
                )
            ).scalar_one()
            values["position"] = highest + 1
        result = connection.execute(db.deals.insert().values(**values))
        deal_id = result.inserted_primary_key[0]
        return _read(connection, deal_id)


@router.put("/{deal_id}")
def update_deal(deal_id: int, payload: DealIn) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, deal_id)
        values = payload.model_dump()
        _require_exists(connection, db.organizations, values["organization_id"], "Organization")
        _require_exists(connection, db.contacts, values["contact_id"], "Contact")
        if values["position"] is None:
            values["position"] = connection.execute(
                select(db.deals.c.position).where(db.deals.c.id == deal_id)
            ).scalar_one()
        connection.execute(
            db.deals.update().where(db.deals.c.id == deal_id).values(**values)
        )
        return _read(connection, deal_id)


@router.delete("/{deal_id}")
def delete_deal(deal_id: int) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, deal_id)
        activities = connection.execute(
            select(db.activities.c.description)
            .where(db.activities.c.deal_id == deal_id)
            .order_by(db.activities.c.id)
        ).scalars().all()
        connection.execute(db.activities.delete().where(db.activities.c.deal_id == deal_id))
        connection.execute(db.deals.delete().where(db.deals.c.id == deal_id))

    return {"activities": list(activities)}


def _require_exists(connection, table, value: int, label: str) -> None:
    found = connection.execute(select(table.c.id).where(table.c.id == value)).first()
    if found is None:
        raise HTTPException(status_code=400, detail=f"{label} does not exist")
