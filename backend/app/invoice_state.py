"""An invoice's worked-out state: its balance, its one status and how late it is.

Stored on the invoice: draft, issued or void. The rest is worked out from the
payments and the due date — part paid, paid and overdue. The frontend's
lib/invoice.ts does the same, and both sides run the cases in
shared/invoice-cases.json.
"""

from __future__ import annotations

from datetime import date

DRAFT = "draft"
ISSUED = "issued"
VOID = "void"
PART_PAID = "part paid"
PAID = "paid"
OVERDUE = "overdue"

NOT_YET_DUE = "not yet due"
DAYS_1_TO_30 = "1 to 30"
DAYS_31_TO_60 = "31 to 60"
DAYS_61_TO_90 = "61 to 90"
OVER_90 = "over 90"

AGING_BUCKETS = (NOT_YET_DUE, DAYS_1_TO_30, DAYS_31_TO_60, DAYS_61_TO_90, OVER_90)
"""How late what is owed is, oldest money last: the dashboard's five buckets."""


def balance(total_cents: int, paid_cents: int) -> int:
    """What is still owed: the total minus the payments."""
    return total_cents - paid_cents


def display_status(
    stored_status: str,
    total_cents: int,
    paid_cents: int,
    due_date: date | None,
    today: date,
) -> str:
    """The one status an invoice shows.

    Void and draft are stored and win first; the rest comes from the balance
    and the due date — paid at zero, overdue when money is still owed after
    the due date (due today is not overdue), part paid when some of the total
    is paid, issued otherwise.
    """
    if stored_status == VOID:
        return VOID
    if stored_status == DRAFT:
        return DRAFT
    if paid_cents >= total_cents:
        return PAID
    if due_date is not None and due_date < today:
        return OVERDUE
    if paid_cents > 0:
        return PART_PAID
    return ISSUED


def days_overdue(due_date: date, today: date) -> int:
    """How many days past the due date today is; negative while not yet due."""
    return (today - due_date).days


def aging_bucket(due_date: date, today: date) -> str:
    """Which of the five buckets a debt past its due date belongs to."""
    overdue = days_overdue(due_date, today)
    if overdue <= 0:
        return NOT_YET_DUE
    if overdue <= 30:
        return DAYS_1_TO_30
    if overdue <= 60:
        return DAYS_31_TO_60
    if overdue <= 90:
        return DAYS_61_TO_90
    return OVER_90
