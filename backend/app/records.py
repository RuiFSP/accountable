"""Record helpers shared by every area: links, reads and attribution."""

from fastapi import HTTPException
from sqlalchemy import select


def require_exists(connection, table, row_id: int, label: str) -> None:
    """Reject a foreign key that points at a record that isn't there."""
    found = connection.execute(select(table.c.id).where(table.c.id == row_id)).first()
    if found is None:
        raise HTTPException(status_code=400, detail=f"{label} does not exist")


def read_or_404(connection, table, row_id: int, label: str) -> dict:
    """One row as a dict, or a 404 naming the kind of record."""
    row = (
        connection.execute(select(table).where(table.c.id == row_id))
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return dict(row)


def stamp_created(values: dict, user: str) -> dict:
    """The values an add writes: who added the record and who last changed it."""
    return {**values, "created_by": user, "updated_by": user}


def stamp_updated(existing: dict, values: dict, user: str) -> dict:
    """The values a save writes, crediting the user only when a value changed."""
    if any(existing[name] != value for name, value in values.items()):
        values["updated_by"] = user
    return values
