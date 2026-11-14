from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app import db

router = APIRouter(prefix="/api/activities", tags=["activities"])

ActivityType = Literal["note", "call", "email"]
SortField = Literal["id", "type", "happened_at"]
SortOrder = Literal["asc", "desc"]


class ActivityIn(BaseModel):
    type: ActivityType
    contact_id: int | None = None
    deal_id: int | None = None
    description: str = Field(min_length=1)
    happened_at: datetime
    follow_up_date: date | None = None
    done: bool = False


def _validate_links(connection, payload: ActivityIn) -> None:
    if (payload.contact_id is None) == (payload.deal_id is None):
        raise HTTPException(
            status_code=400,
            detail="An activity must be linked to exactly one contact or deal.",
        )
    if payload.contact_id is not None:
        found = connection.execute(
            select(db.contacts.c.id).where(db.contacts.c.id == payload.contact_id)
        ).first()
        if found is None:
            raise HTTPException(status_code=400, detail="Contact does not exist")
    if payload.deal_id is not None:
        found = connection.execute(
            select(db.deals.c.id).where(db.deals.c.id == payload.deal_id)
        ).first()
        if found is None:
            raise HTTPException(status_code=400, detail="Deal does not exist")


def _read(conn, activity_id: int) -> dict:
    row = conn.execute(
        select(db.activities).where(db.activities.c.id == activity_id)
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return dict(row)


@router.get("")
def list_activities(
    q: str | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    stmt = select(db.activities)
    if q:
        stmt = stmt.where(db.activities.c.description.like(f"%{q}%"))
    column = db.activities.c[sort]
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), db.activities.c.id)
    with db.get_engine().connect() as connection:
        rows = connection.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_activity(payload: ActivityIn) -> dict:
    with db.get_engine().begin() as connection:
        _validate_links(connection, payload)
        result = connection.execute(db.activities.insert().values(**payload.model_dump()))
        activity_id = result.inserted_primary_key[0]
        return _read(connection, activity_id)


@router.put("/{activity_id}")
def update_activity(activity_id: int, payload: ActivityIn) -> dict:
    with db.get_engine().begin() as connection:
        existing = _read(connection, activity_id)
        if existing["type"] == "stage_change":
            raise HTTPException(status_code=400, detail="Stage-change entries are read-only.")
        _validate_links(connection, payload)
        connection.execute(
            db.activities.update()
            .where(db.activities.c.id == activity_id)
            .values(**payload.model_dump())
        )
        return _read(connection, activity_id)


@router.delete("/{activity_id}")
def delete_activity(activity_id: int) -> dict:
    with db.get_engine().begin() as connection:
        existing = _read(connection, activity_id)
        if existing["type"] == "stage_change":
            raise HTTPException(status_code=400, detail="Stage-change entries are read-only.")
        connection.execute(db.activities.delete().where(db.activities.c.id == activity_id))
    return {}
