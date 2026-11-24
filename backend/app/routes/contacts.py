from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app import auth, db
from app.records import read_or_404, require_exists, stamp_created, stamp_updated

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
        db.organizations,
        db.contacts.c.organization_id == db.organizations.c.id,
        isouter=True,
    )


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
def create_contact(payload: ContactIn, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        if payload.organization_id is not None:
            require_exists(
                connection, db.organizations, payload.organization_id, "Organization"
            )
        result = connection.execute(
            db.contacts.insert().values(**stamp_created(payload.model_dump(), user))
        )
        contact_id = db.inserted_id(result)
        return read_or_404(connection, db.contacts, contact_id, "Contact")


@router.put("/{contact_id}")
def update_contact(
    contact_id: int, payload: ContactIn, user: str = Depends(auth.current_user)
) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.contacts, contact_id, "Contact")
        if payload.organization_id is not None:
            require_exists(
                connection, db.organizations, payload.organization_id, "Organization"
            )
        values = stamp_updated(existing, payload.model_dump(), user)
        connection.execute(
            db.contacts.update().where(db.contacts.c.id == contact_id).values(**values)
        )
        return read_or_404(connection, db.contacts, contact_id, "Contact")


@router.delete("/{contact_id}")
def delete_contact(contact_id: int) -> dict:
    with db.get_engine().begin() as connection:
        read_or_404(connection, db.contacts, contact_id, "Contact")
        activities = (
            connection.execute(
                select(db.activities.c.description)
                .where(db.activities.c.contact_id == contact_id)
                .order_by(db.activities.c.id)
            )
            .scalars()
            .all()
        )
        # The contact goes, the deals that stay keep their organization but
        # lose their main contact.
        connection.execute(
            db.deals.update()
            .where(db.deals.c.contact_id == contact_id)
            .values(contact_id=None)
        )
        connection.execute(
            db.activities.delete().where(db.activities.c.contact_id == contact_id)
        )
        connection.execute(db.contacts.delete().where(db.contacts.c.id == contact_id))

    return {"activities": list(activities), "counts": {"activities": len(activities)}}
