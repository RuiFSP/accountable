from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app import db

router = APIRouter(prefix="/api/organizations", tags=["organizations"])

SortField = Literal["id", "name", "website", "industry"]
SortOrder = Literal["asc", "desc"]


class OrganizationIn(BaseModel):
    name: str = Field(min_length=1)
    website: str | None = None
    industry: str | None = None
    notes: str | None = None


def _read(conn, organization_id: int) -> dict:
    row = conn.execute(
        select(db.organizations).where(db.organizations.c.id == organization_id)
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return dict(row)


@router.get("")
def list_organizations(
    q: str | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    stmt = select(db.organizations)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                db.organizations.c.name.like(pattern),
                db.organizations.c.website.like(pattern),
            )
        )
    column = db.organizations.c[sort]
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc(), db.organizations.c.id)
    with db.get_engine().connect() as connection:
        rows = connection.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_organization(payload: OrganizationIn) -> dict:
    with db.get_engine().begin() as connection:
        result = connection.execute(db.organizations.insert().values(**payload.model_dump()))
        organization_id = result.inserted_primary_key[0]
        return _read(connection, organization_id)


@router.put("/{organization_id}")
def update_organization(organization_id: int, payload: OrganizationIn) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, organization_id)
        connection.execute(
            db.organizations.update()
            .where(db.organizations.c.id == organization_id)
            .values(**payload.model_dump())
        )
        return _read(connection, organization_id)


@router.delete("/{organization_id}")
def delete_organization(organization_id: int) -> dict:
    with db.get_engine().begin() as connection:
        _read(connection, organization_id)
        contact_ids = select(db.contacts.c.id).where(
            db.contacts.c.organization_id == organization_id
        )
        deal_ids = select(db.deals.c.id).where(db.deals.c.organization_id == organization_id)

        contacts = connection.execute(
            select(db.contacts.c.name)
            .where(db.contacts.c.organization_id == organization_id)
            .order_by(db.contacts.c.id)
        ).scalars().all()
        deals = connection.execute(
            select(db.deals.c.name)
            .where(db.deals.c.organization_id == organization_id)
            .order_by(db.deals.c.id)
        ).scalars().all()
        cascade_condition = or_(
            db.activities.c.contact_id.in_(contact_ids),
            db.activities.c.deal_id.in_(deal_ids),
        )
        activities = connection.execute(
            select(db.activities.c.description)
            .where(cascade_condition)
            .order_by(db.activities.c.id)
        ).scalars().all()

        connection.execute(db.activities.delete().where(cascade_condition))
        connection.execute(db.deals.delete().where(db.deals.c.organization_id == organization_id))
        connection.execute(
            db.contacts.delete().where(db.contacts.c.organization_id == organization_id)
        )
        connection.execute(db.organizations.delete().where(db.organizations.c.id == organization_id))

    return {"contacts": list(contacts), "deals": list(deals), "activities": list(activities)}
