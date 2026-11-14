from fastapi import APIRouter
from sqlalchemy import select

from app import db

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("")
def list_activities() -> list[dict]:
    with db.get_engine().connect() as connection:
        rows = connection.execute(select(db.activities).order_by(db.activities.c.id)).mappings()
    return [dict(row) for row in rows]
