from fastapi import APIRouter

from app import db, stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard() -> dict:
    with db.get_engine().connect() as connection:
        return stats.dashboard_payload(connection)
