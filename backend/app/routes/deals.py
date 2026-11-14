from fastapi import APIRouter
from sqlalchemy import select

from app import db

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.get("")
def list_deals() -> list[dict]:
    with db.get_engine().connect() as connection:
        rows = connection.execute(select(db.deals).order_by(db.deals.c.id)).mappings()
    return [dict(row) for row in rows]
