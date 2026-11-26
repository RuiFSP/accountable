"""The sums on a quote or an invoice: each line's amount, the subtotal, the tax and the total.

The frontend's lib/tax.ts does the same sums, for what a page shows before it saves,
and both run the cases in shared/totals-cases.json. The backend's sums are the ones
saved, worked out from the lines, never taken from totals the browser sends.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Annotated, Protocol

from pydantic import Field, StrictInt

MAX_QUANTITY = 1_000_000
QUANTITY_MESSAGE = "Enter a whole number from 1 to 1,000,000"

# The money columns are 32-bit integers, and an accepted quote's subtotal becomes its
# deal's value, so every amount here stays inside the same limit.
MAX_AMOUNT_CENTS = 2_147_483_647
AMOUNT_MESSAGE = "Keep each amount to $21,474,836.47 or less"

PER_PERCENT = 1000
"""A rate of 1% is 1000 thousandths of a percent."""
ALL_THOUSANDTHS = 100 * PER_PERCENT
"""A rate of 100%, in thousandths of a percent."""

Quantity = Annotated[StrictInt, Field(ge=1, le=MAX_QUANTITY)]


class Line(Protocol):
    """A line as any area keeps it: only the quantity and price are read here."""

    @property
    def quantity(self) -> int: ...

    @property
    def unit_price_cents(self) -> int: ...


@dataclass(frozen=True)
class Totals:
    subtotal_cents: int
    tax_cents: int
    total_cents: int


def line_amount(quantity: int, unit_price_cents: int) -> int:
    return quantity * unit_price_cents


def tax_on(subtotal_cents: int, rate_thousandths: int) -> int:
    """The tax at a rate in thousandths of a percent, to the nearest cent, halves up.

    Whole-number arithmetic only: Python's round() sends a half cent to the even one,
    so 2.5 cents would be 2 here and 3 in the browser.
    """
    return (subtotal_cents * rate_thousandths + ALL_THOUSANDTHS // 2) // ALL_THOUSANDTHS


def totals(lines: Iterable[Line], rate_thousandths: int) -> Totals:
    """Tax once, on the subtotal, never line by line, where each line's rounding adds up."""
    subtotal = sum(line_amount(line.quantity, line.unit_price_cents) for line in lines)
    tax = tax_on(subtotal, rate_thousandths)
    return Totals(subtotal_cents=subtotal, tax_cents=tax, total_cents=subtotal + tax)
