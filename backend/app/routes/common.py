"""Checks shared by the record routes."""

from fastapi import HTTPException
from sqlalchemy import select


def require_exists(connection, table, row_id: int, label: str) -> None:
    """Reject a foreign key that points at a record that isn't there."""
    found = connection.execute(select(table.c.id).where(table.c.id == row_id)).first()
    if found is None:
        raise HTTPException(status_code=400, detail=f"{label} does not exist")
