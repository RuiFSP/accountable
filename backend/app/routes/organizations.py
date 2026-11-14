from fastapi import APIRouter
from sqlalchemy import select

from app import db

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("")
def list_organizations() -> list[dict]:
    with db.get_engine().connect() as connection:
        rows = connection.execute(select(db.organizations).order_by(db.organizations.c.id)).mappings()
    return [dict(row) for row in rows]
