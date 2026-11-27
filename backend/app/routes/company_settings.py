"""The team's company settings: one row, read and replaced, and the logo."""

import base64
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app import auth, db, documents, images

router = APIRouter(prefix="/api/settings", tags=["settings"])

TAX_RATE_MAX_THOUSANDTHS = 100_000  # 100%
PAYMENT_TERMS_MAX_DAYS = 365
PREFIX_MAX_LENGTH = 10

NAME_REQUIRED = "The company name is required."
EMAIL_INVALID = "The email must look like an email."
TAX_RATE_RANGE = "The tax rate must be between 0 and 100."
PAYMENT_TERMS_RANGE = "Payment terms must be a whole number of days from 0 to 365."
PREFIX_INVALID = "A prefix can be at most 10 characters of letters, digits and hyphens."
DESIGN_INVALID = "The invoice design is Classic, Modern or Compact."
ACCENT_INVALID = "The accent is a hex color: # followed by six digits."
ACCENT_CONTRAST = "The accent is too light to read on white. Choose a darker color."

EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PREFIX_PATTERN = re.compile(r"[A-Za-z0-9-]+")
HEX_PATTERN = re.compile(r"#[0-9A-Fa-f]{6}")


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
    invoice_design: str = documents.DEFAULT_INVOICE_DESIGN
    accent_color: str = documents.DEFAULT_ACCENT_COLOR


class LogoIn(BaseModel):
    content_type: str
    data: str  # the logo's bytes, base64


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


def _accent(value: str) -> str:
    """The accent, if it is a hex color that keeps text readable on white."""
    if not HEX_PATTERN.fullmatch(value):
        raise HTTPException(status_code=400, detail=ACCENT_INVALID)
    if not documents.accent_is_readable(value):
        raise HTTPException(status_code=400, detail=ACCENT_CONTRAST)
    return value


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
    if payload.invoice_design not in documents.INVOICE_DESIGNS:
        raise HTTPException(status_code=400, detail=DESIGN_INVALID)
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
        "invoice_design": payload.invoice_design,
        "accent_color": _accent(payload.accent_color),
    }


def _as_reply(row: dict) -> dict:
    """The row with its moment in UTC, and without the logo's bytes.

    The logo is served at its own address; JSON only says whether one is
    uploaded and what it is.
    """
    moment = row["updated_at"]
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    kept = {key: value for key, value in row.items() if key != "logo_data"}
    return {**kept, "updated_at": moment}


@router.get("")
def get_settings() -> dict:
    with db.get_engine().connect() as connection:
        return _as_reply(documents.current_settings(connection))


@router.put("")
def save_settings(
    payload: CompanySettingsIn, user: str = Depends(auth.current_user)
) -> dict:
    """Replace every setting, crediting the user only when a stored value differs."""
    values = _checked(payload)
    with db.get_engine().begin() as connection:
        existing = documents.current_settings(connection)
        if any(existing[name] != value for name, value in values.items()):
            values["updated_by"] = user
            values["updated_at"] = datetime.now(UTC).replace(tzinfo=None)
            connection.execute(
                db.company_settings.update()
                .where(db.company_settings.c.id == 1)
                .values(**values)
            )
        return _as_reply(documents.current_settings(connection))


@router.get("/logo")
def get_logo() -> Response:
    """The uploaded logo's bytes, with the type its bytes really carry."""
    with db.get_engine().connect() as connection:
        settings = documents.current_settings(connection)
    if settings["logo_data"] is None:
        raise HTTPException(status_code=404, detail="Logo not found")
    return Response(
        content=settings["logo_data"], media_type=settings["logo_content_type"]
    )


@router.put("/logo")
def save_logo(payload: LogoIn, user: str = Depends(auth.current_user)) -> dict:
    """Keep the uploaded logo in the settings row: Render's disk keeps no files."""
    try:
        data = base64.b64decode(payload.data, validate=True)
    except ValueError:
        raise HTTPException(status_code=400, detail=images.NOT_AN_IMAGE) from None
    content_type = images.checked_type(data)
    with db.get_engine().begin() as connection:
        existing = documents.current_settings(connection)
        if (existing["logo_data"], existing["logo_content_type"]) != (
            data,
            content_type,
        ):
            _touch_logo(
                connection, user, logo_data=data, logo_content_type=content_type
            )
        return _as_reply(documents.current_settings(connection))


@router.delete("/logo")
def delete_logo(user: str = Depends(auth.current_user)) -> dict:
    """Remove an uploaded logo; the letterhead goes back to the name alone."""
    with db.get_engine().begin() as connection:
        existing = documents.current_settings(connection)
        if existing["logo_data"] is not None:
            _touch_logo(connection, user, logo_data=None, logo_content_type=None)
        return _as_reply(documents.current_settings(connection))


def _touch_logo(connection, user: str, **values) -> None:
    connection.execute(
        db.company_settings.update()
        .where(db.company_settings.c.id == 1)
        .values(
            **values,
            updated_by=user,
            updated_at=datetime.now(UTC).replace(tzinfo=None),
        )
    )
