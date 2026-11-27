"""What quotes and invoices share: the company settings as saved, and each
document's next number.

Both areas read the settings and take a number inside the transaction that
saves the document, so a failed save gives its number back and no number is
skipped. Quotes and invoices count apart.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app import db
from app.records import read_or_404

DocumentKind = Literal["quote", "invoice"]

DIGITS = 4
"""A number has at least four figures, such as QT-0001, and more once it passes 9999."""

INVOICE_DESIGNS = ("classic", "modern", "compact")
"""The three looks an invoice can be drawn in, chosen in Settings."""

DEFAULT_INVOICE_DESIGN = "classic"
DEFAULT_ACCENT_COLOR = "#073B4C"
"""Midnight, the brand's ink: the accent a database without the Documents
section gains (company-settings decision 18)."""


def accent_is_readable(hex_color: str) -> bool:
    """Whether text drawn in this accent stays readable on white paper.

    The page and the backend both refuse one below 4.5:1 (company-settings
    decision 22), and both run the accents in shared/invoice-cases.json.
    """
    return _contrast_vs_white(hex_color) >= 4.5


def _contrast_vs_white(hex_color: str) -> float:
    return 1.05 / (_luminance(hex_color) + 0.05)


def _luminance(hex_color: str) -> float:
    def channel(light: int) -> float:
        shade = light / 255
        return shade / 12.92 if shade <= 0.04045 else ((shade + 0.055) / 1.055) ** 2.4

    red = channel(int(hex_color[1:3], 16))
    green = channel(int(hex_color[3:5], 16))
    blue = channel(int(hex_color[5:7], 16))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


_PREFIX_COLUMNS = {
    "quote": "quote_prefix",
    "invoice": "invoice_prefix",
}


def current_settings(connection) -> dict:
    """The settings as saved, including the tax label and rate in thousandths."""
    return read_or_404(connection, db.company_settings, 1, "Settings")


def take_number(connection, kind: DocumentKind) -> str:
    """The next number for a quote or an invoice, such as QT-0001.

    The prefix is read at the moment the number is taken, so changing it changes
    the next number's start but not its count. Take it inside the document's own
    write transaction: a save that fails rolls the counter back with it.
    """
    number = _next_number(connection, kind)
    prefix = current_settings(connection)[_PREFIX_COLUMNS[kind]] or ""
    return f"{prefix}{number:0{DIGITS}d}"


def _next_number(connection, kind: DocumentKind) -> int:
    """One more than the kind's last number, starting at 1.

    The update is one statement, and the insert retries after a unique clash, so
    two saves at the same moment cannot take the same number. The app has no
    process-wide write lock to serialise them for us.
    """
    for _ in range(3):
        found = connection.execute(
            update(db.number_counters)
            .where(db.number_counters.c.kind == kind)
            .values(last_number=db.number_counters.c.last_number + 1)
            .returning(db.number_counters.c.last_number)
        ).scalar_one_or_none()
        if found is not None:
            return found
        try:
            with connection.begin_nested():
                return connection.execute(
                    db.number_counters.insert()
                    .values(kind=kind, last_number=1)
                    .returning(db.number_counters.c.last_number)
                ).scalar_one()
        except IntegrityError:
            continue
    raise RuntimeError("Could not take a document number.")
