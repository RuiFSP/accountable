from fastapi import APIRouter
from sqlalchemy import select

from app import db

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("")
def list_contacts() -> list[dict]:
    with db.get_engine().connect() as connection:
        rows = connection.execute(select(db.contacts).order_by(db.contacts.c.id)).mappings()
    return [dict(row) for row in rows]
