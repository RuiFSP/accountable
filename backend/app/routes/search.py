"""Search across organizations, contacts, deals and active products, matched in Python."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import Table, select

from app import db

router = APIRouter(prefix="/api/search", tags=["search"])

Kind = Literal["organization", "contact", "deal", "product"]

# id and name from each table, in the order the agreement names the kinds.
TABLES: tuple[tuple[Kind, Table], ...] = (
    ("organization", db.organizations),
    ("contact", db.contacts),
    ("deal", db.deals),
    ("product", db.products),
)


class SearchResult(BaseModel):
    kind: Kind
    id: int
    name: str


@router.get("")
def search(q: str | None = None) -> list[SearchResult]:
    """Part of a name, ignoring case — the same answer on SQLite and Postgres.

    The match happens here rather than in SQL so neither database's LIKE or
    locale can make them disagree, and `%` and `_` mean only themselves.
    """
    needle = (q or "").strip().casefold()
    if not needle:
        raise HTTPException(status_code=400, detail="Search needs a query.")

    found: list[SearchResult] = []
    with db.get_engine().connect() as connection:
        for kind, table in TABLES:
            stmt = select(table.c.id, table.c.name)
            if kind == "product":
                # Archived products are hidden from the top-bar search.
                stmt = stmt.where(table.c.active.is_(True))
            rows = connection.execute(stmt)
            for row in rows:
                if needle in row.name.casefold():
                    found.append(SearchResult(kind=kind, id=row.id, name=row.name))
    return sorted(
        found, key=lambda result: (result.name.casefold(), result.kind, result.id)
    )
