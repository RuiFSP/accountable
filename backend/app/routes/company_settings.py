"""The team's company settings: one row, read and replaced."""

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import auth, db
from app.records import read_or_404

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_ID = 1
TAX_RATE_MAX_THOUSANDTHS = 100_000  # 100%
PAYMENT_TERMS_MAX_DAYS = 365
PREFIX_MAX_LENGTH = 10

NAME_REQUIRED = "The company name is required."
EMAIL_INVALID = "The email must look like an email."
TAX_RATE_RANGE = "The tax rate must be between 0 and 100."
PAYMENT_TERMS_RANGE = "Payment terms must be a whole number of days from 0 to 365."
PREFIX_INVALID = "A prefix can be at most 10 characters of letters, digits and hyphens."

EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PREFIX_PATTERN = re.compile(r"[A-Za-z0-9-]+")


class CompanySettingsIn(BaseModel):
    name: str
    address: str | None = None
    email: str | None = None
    phone: str | None = None
    tax_label: str | None = None
    tax_rate_thousandths: int = 0
    payment_terms_days: int = 0
    quote_prefix: str | None = None
    invoice_prefix: str | None = None


def _text(value: str | None) -> str | None:
    """Optional text trimmed, with a blank becoming nothing."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _prefix(value: str | None) -> str | None:
    trimmed = _text(value)
    if trimmed is None:
        return None
    if len(trimmed) > PREFIX_MAX_LENGTH or not PREFIX_PATTERN.fullmatch(trimmed):
        raise HTTPException(status_code=400, detail=PREFIX_INVALID)
    return trimmed


def _checked(payload: CompanySettingsIn) -> dict:
    """Every field trimmed and checked with the same rules the page applies."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail=NAME_REQUIRED)
    email = _text(payload.email)
    if email is not None and not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(status_code=400, detail=EMAIL_INVALID)
    if not 0 <= payload.tax_rate_thousandths <= TAX_RATE_MAX_THOUSANDTHS:
        raise HTTPException(status_code=400, detail=TAX_RATE_RANGE)
    if not 0 <= payload.payment_terms_days <= PAYMENT_TERMS_MAX_DAYS:
        raise HTTPException(status_code=400, detail=PAYMENT_TERMS_RANGE)
    return {
        "name": name,
        "address": _text(payload.address),
        "email": email,
        "phone": _text(payload.phone),
        "tax_label": _text(payload.tax_label),
        "tax_rate_thousandths": payload.tax_rate_thousandths,
        "payment_terms_days": payload.payment_terms_days,
        "quote_prefix": _prefix(payload.quote_prefix),
        "invoice_prefix": _prefix(payload.invoice_prefix),
    }


def _as_reply(row: dict) -> dict:
    """The row with its moment in UTC, which SQLite hands back without one."""
    moment = row["updated_at"]
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return {**row, "updated_at": moment}


def _read(connection) -> dict:
    return read_or_404(connection, db.company_settings, SETTINGS_ID, "Settings")


@router.get("")
def get_settings() -> dict:
    with db.get_engine().connect() as connection:
        return _as_reply(_read(connection))


@router.put("")
def save_settings(
    payload: CompanySettingsIn, user: str = Depends(auth.current_user)
) -> dict:
    """Replace every setting, crediting the user only when a stored value differs."""
    values = _checked(payload)
    with db.get_engine().begin() as connection:
        existing = _read(connection)
        if any(existing[name] != value for name, value in values.items()):
            values["updated_by"] = user
            values["updated_at"] = datetime.now(UTC)
            connection.execute(
                db.company_settings.update()
                .where(db.company_settings.c.id == SETTINGS_ID)
                .values(**values)
            )
        return _as_reply(_read(connection))
