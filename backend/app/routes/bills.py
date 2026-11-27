"""Bills: the money the business owes a supplier, as the supplier billed it.

Status is derived from the dates and never stored: paid when the paid date is
set, overdue when unpaid and the due date is before today, else unpaid — due
today is unpaid. The total is the backend's sum of the amount and the tax,
and the same supplier can't have two bills with the same number, compared
ignoring case in Python so SQLite and Postgres answer the same.
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app import auth, db
from app.holds import Hold
from app.records import read_or_404, require_exists, stamp_created, stamp_updated

router = APIRouter(prefix="/api/bills", tags=["bills"])

HOLDS: tuple[Hold, ...] = (Hold(db.bills.c.organization_id, "bill"),)

Category = Literal["Software", "Contractors", "Travel", "Office", "Marketing", "Other"]
CATEGORIES: tuple[str, ...] = (
    "Software",
    "Contractors",
    "Travel",
    "Office",
    "Marketing",
    "Other",
)
BillStatus = Literal["unpaid", "overdue", "paid"]
SortField = Literal[
    "id",
    "organization_name",
    "bill_number",
    "bill_date",
    "due_date",
    "category",
    "total_cents",
    "paid_date",
]
SortOrder = Literal["asc", "desc"]

# The Integer column's own range: each part and their sum must fit it, so
# every amount accepted here stores the same on SQLite and Postgres.
MAX_CENTS = 2_147_483_647
DUE_AFTER_DAYS = 30


class BillIn(BaseModel):
    # No total and no paid date: the total is the backend's sum and the paid
    # and unpaid actions own the paid date. A payload that smuggles either is
    # ignored.
    organization_id: int
    bill_number: str
    bill_date: date
    due_date: date | None = None
    category: Category
    amount_cents: int = Field(ge=0, le=MAX_CENTS)
    tax_cents: int = Field(ge=0, le=MAX_CENTS)
    notes: str | None = None


class PaidIn(BaseModel):
    day: date | None = None


def bill_status(bill, today: date | None = None) -> BillStatus:
    """The one derivation of a bill's status, shared with the dashboard."""
    today = today or date.today()
    if bill["paid_date"] is not None:
        return "paid"
    if bill["due_date"] < today:
        return "overdue"
    return "unpaid"


def _row(connection, bill_id: int) -> dict:
    """One bill the way every reply sends it: the supplier's name and status."""
    row = (
        connection.execute(
            select(db.bills, db.organizations.c.name.label("organization_name"))
            .select_from(
                db.bills.join(
                    db.organizations,
                    db.bills.c.organization_id == db.organizations.c.id,
                )
            )
            .where(db.bills.c.id == bill_id)
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    bill = dict(row)
    bill["status"] = bill_status(bill)
    return bill


def _number(
    connection,
    organization_id: int,
    bill_number: str,
    exclude_id: int | None = None,
) -> str:
    """The trimmed bill number, or the refusal when it is blank or already
    one of this supplier's numbers.

    The comparison happens here, not in SQL, so SQLite and Postgres agree.
    """
    cleaned = bill_number.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Bill number is required.")
    stmt = select(db.bills.c.id, db.bills.c.bill_number).where(
        db.bills.c.organization_id == organization_id
    )
    if exclude_id is not None:
        stmt = stmt.where(db.bills.c.id != exclude_id)
    for row in connection.execute(stmt):
        if row.bill_number.casefold() == cleaned.casefold():
            raise HTTPException(
                status_code=400,
                detail=f'A bill numbered "{row.bill_number}" already exists for this supplier.',
            )
    return cleaned


def _total(amount_cents: int, tax_cents: int) -> int:
    """The backend's sum, refused when it is past the integer column."""
    if amount_cents + tax_cents > MAX_CENTS:
        raise HTTPException(
            status_code=400,
            detail="The total is larger than a bill can hold.",
        )
    return amount_cents + tax_cents


def _due_date(bill_date: date, due_date: date | None) -> date:
    return due_date if due_date is not None else bill_date + timedelta(DUE_AFTER_DAYS)


def _base_stmt():
    return select(
        db.bills, db.organizations.c.name.label("organization_name")
    ).select_from(
        db.bills.join(
            db.organizations,
            db.bills.c.organization_id == db.organizations.c.id,
        )
    )


@router.get("")
def list_bills(
    q: str | None = None,
    status: BillStatus | None = None,
    organization_id: int | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    stmt = _base_stmt()
    if q:
        pattern = f"%{q}%"
        # ilike, not like: SQLite's LIKE ignores case but Postgres's does not.
        stmt = stmt.where(
            or_(
                db.organizations.c.name.ilike(pattern),
                db.bills.c.bill_number.ilike(pattern),
            )
        )
    if organization_id is not None:
        stmt = stmt.where(db.bills.c.organization_id == organization_id)
    if sort == "organization_name":
        order_column = db.organizations.c.name
    else:
        order_column = db.bills.c[sort]
    stmt = stmt.order_by(
        order_column.desc() if order == "desc" else order_column.asc(), db.bills.c.id
    )
    with db.get_engine().connect() as connection:
        rows = [dict(row) for row in connection.execute(stmt).mappings().all()]
    for row in rows:
        row["status"] = bill_status(row)
    if status is not None:
        rows = [row for row in rows if row["status"] == status]
    return rows


@router.post("", status_code=201)
def create_bill(payload: BillIn, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        values = payload.model_dump()
        require_exists(
            connection, db.organizations, values["organization_id"], "Organization"
        )
        values["bill_number"] = _number(
            connection, values["organization_id"], values["bill_number"]
        )
        values["due_date"] = _due_date(values["bill_date"], values["due_date"])
        values["total_cents"] = _total(values["amount_cents"], values["tax_cents"])
        result = connection.execute(
            db.bills.insert().values(**stamp_created(values, user))
        )
        return _row(connection, db.inserted_id(result))


@router.put("/{bill_id}")
def update_bill(
    bill_id: int,
    payload: BillIn,
    user: str = Depends(auth.current_user),
) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.bills, bill_id, "Bill")
        values = payload.model_dump()
        require_exists(
            connection, db.organizations, values["organization_id"], "Organization"
        )
        values["bill_number"] = _number(
            connection, values["organization_id"], values["bill_number"], bill_id
        )
        values["due_date"] = _due_date(values["bill_date"], values["due_date"])
        values["total_cents"] = _total(values["amount_cents"], values["tax_cents"])
        # An edit never changes whether the bill is paid; the paid and unpaid
        # actions own that, so paid_date is left out of the save entirely.
        values = stamp_updated(existing, values, user)
        connection.execute(
            db.bills.update().where(db.bills.c.id == bill_id).values(**values)
        )
        return _row(connection, bill_id)


@router.delete("/{bill_id}")
def delete_bill(bill_id: int) -> dict:
    with db.get_engine().begin() as connection:
        read_or_404(connection, db.bills, bill_id, "Bill")
        connection.execute(db.bills.delete().where(db.bills.c.id == bill_id))
    # A bill holds no other records, so nothing goes with it.
    return {"counts": {}}


@router.post("/{bill_id}/paid")
def mark_paid(
    bill_id: int,
    payload: PaidIn | None = None,
    user: str = Depends(auth.current_user),
) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.bills, bill_id, "Bill")
        day = payload.day if payload and payload.day else date.today()
        values = stamp_updated(existing, {"paid_date": day}, user)
        connection.execute(
            db.bills.update().where(db.bills.c.id == bill_id).values(**values)
        )
        return _row(connection, bill_id)


@router.post("/{bill_id}/unpaid")
def mark_unpaid(bill_id: int, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        existing = read_or_404(connection, db.bills, bill_id, "Bill")
        values = stamp_updated(existing, {"paid_date": None}, user)
        connection.execute(
            db.bills.update().where(db.bills.c.id == bill_id).values(**values)
        )
        return _row(connection, bill_id)
