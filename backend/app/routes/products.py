"""Products: the price list. Names stay unique ignoring case; archive, never delete."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app import auth, db
from app.records import read_or_404, stamp_created, stamp_updated

router = APIRouter(prefix="/api/products", tags=["products"])

SortField = Literal["id", "name", "description", "price_cents", "active"]
SortOrder = Literal["asc", "desc"]


class ProductIn(BaseModel):
    # The blank-name rule lives in _unique_name, not here, so every blank
    # refuses the same way and the form shows the message it returns.
    name: str
    description: str | None = None
    # The Integer column's own range: every price accepted here stores on both
    # SQLite and Postgres, so the two cannot disagree.
    price_cents: int = Field(ge=0, le=2_147_483_647)


def _unique_name(connection, name: str, exclude_id: int | None = None) -> str:
    """The trimmed name, or the refusal when it is blank or already taken.

    The comparison happens here, not in SQL, so SQLite and Postgres agree and
    an archived product's name stays reserved.
    """
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Product name is required.")
    stmt = select(db.products.c.id, db.products.c.name)
    if exclude_id is not None:
        stmt = stmt.where(db.products.c.id != exclude_id)
    for row in connection.execute(stmt):
        if row.name.casefold() == cleaned.casefold():
            raise HTTPException(
                status_code=400,
                detail=f'A product named "{row.name}" already exists.',
            )
    return cleaned


@router.get("")
def list_products(
    q: str | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
    include_archived: bool = False,
) -> list[dict]:
    stmt = select(db.products)
    if not include_archived:
        stmt = stmt.where(db.products.c.active.is_(True))
    if q:
        pattern = f"%{q}%"
        # ilike, not like: SQLite's LIKE ignores case but Postgres's does not.
        stmt = stmt.where(
            or_(
                db.products.c.name.ilike(pattern),
                db.products.c.description.ilike(pattern),
            )
        )
    column = db.products.c[sort]
    stmt = stmt.order_by(
        column.desc() if order == "desc" else column.asc(), db.products.c.id
    )
    with db.get_engine().connect() as connection:
        rows = connection.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create_product(payload: ProductIn, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        values = payload.model_dump()
        values["name"] = _unique_name(connection, values["name"])
        values["active"] = True
        result = connection.execute(
            db.products.insert().values(**stamp_created(values, user))
        )
        product_id = db.inserted_id(result)
        return read_or_404(connection, db.products, product_id, "Product")


@router.put("/{product_id}")
def update_product(
    product_id: int,
    payload: ProductIn,
    user: str = Depends(auth.current_user),
) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.products, product_id, "Product")
        values = payload.model_dump()
        values["name"] = _unique_name(connection, values["name"], exclude_id=product_id)
        # Editing never changes the archive state; archive and restore own it.
        values["active"] = existing["active"]
        values = stamp_updated(existing, values, user)
        connection.execute(
            db.products.update().where(db.products.c.id == product_id).values(**values)
        )
        return read_or_404(connection, db.products, product_id, "Product")


@router.post("/{product_id}/archive")
def archive_product(product_id: int, user: str = Depends(auth.current_user)) -> dict:
    return _set_active(product_id, False, user)


@router.post("/{product_id}/restore")
def restore_product(product_id: int, user: str = Depends(auth.current_user)) -> dict:
    return _set_active(product_id, True, user)


def _set_active(product_id: int, active: bool, user: str) -> dict:
    """Archive or restore one product, crediting the user only when it changes."""
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.products, product_id, "Product")
        values = stamp_updated(existing, {"active": active}, user)
        connection.execute(
            db.products.update().where(db.products.c.id == product_id).values(**values)
        )
        return read_or_404(connection, db.products, product_id, "Product")
