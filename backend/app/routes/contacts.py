from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app import db

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

SortField = Literal["id", "name", "email", "status", "organization_name"]
SortOrder = Literal["asc", "desc"]
ContactStatus = Literal["lead", "qualified", "customer"]


class ContactIn(BaseModel):
    name: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    organization_id: int | None = None
    status: ContactStatus = "lead"


def _base_stmt():
    return select(db.contacts).join(
        db.organizations, db.contacts.c.organization_id == db.organizations.c.id, isouter=True
    )


def _read(conn, contact_id: int) -> dict:
    row = conn.execute(select(db.contacts).where(db.contacts.c.id == contact_id)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return dict(row)


@router.get("")
def list_contacts(
    q: str | None = None,
    status: ContactStatus | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    stmt = _base_stmt()
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(db.contacts.c.name.like(pattern), db.contacts.c.email.like(pattern))
        )
    if status:
        stmt = stmt.where(db.contacts.c.status == status)
    if sort == "organization_name":
        order_column = db.organizations.c.name
    else:
        order_column = db.contacts.c[sort]
    stmt = stmt.order_by(
        order_column.desc() if order == "desc" else order_column.asc(), db.contacts.c.id
    )
    with db.get_engine().connect() as connection:
        rows = connection.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_contact(payload: ContactIn) -> dict:
    with db.get_engine().begin() as connection:
        result = connection.execute(db.contacts.insert().values(**payload.model_dump()))
        contact_id = result.inserted_primary_key[0]
        return _read(connection, contact_id)


@router.put("/{contact_id}")
def update_contact(contact_id: int, payload: ContactIn) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, contact_id)
        connection.execute(
            db.contacts.update()
            .where(db.contacts.c.id == contact_id)
            .values(**payload.model_dump())
        )
        return _read(connection, contact_id)


@router.delete("/{contact_id}")
def delete_contact(contact_id: int) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, contact_id)
        activities = connection.execute(
            select(db.activities.c.description)
            .where(db.activities.c.contact_id == contact_id)
            .order_by(db.activities.c.id)
        ).scalars().all()
        connection.execute(db.activities.delete().where(db.activities.c.contact_id == contact_id))
        connection.execute(db.contacts.delete().where(db.contacts.c.id == contact_id))

    return {"activities": list(activities)}
