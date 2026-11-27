"""Invoices: the bill for one won deal, its lines, its payments and its PDF.

An invoice is made on a won deal and adds up to the deal's value before tax. A
draft can be changed or deleted; issuing takes its number, stores the snapshots
and the totals, and freezes it; void keeps the number for the record. The
backend works out every amount and never trusts totals from the browser.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal, NamedTuple

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StrictInt
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app import auth, db, documents, invoice_pdf, invoice_state, tax
from app.holds import Hold
from app.records import read_or_404, require_exists, stamp_created

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

# An invoice holds its deal and its organization, void ones included: neither
# can be deleted while any invoice points at it.
HOLDS = (
    Hold(db.invoices.c.deal_id, "invoice"),
    Hold(db.invoices.c.organization_id, "invoice"),
)

SortField = Literal[
    "id",
    "number",
    "organization_name",
    "deal_name",
    "issue_date",
    "due_date",
    "total_cents",
    "balance_cents",
    "status",
]
SortOrder = Literal["asc", "desc"]
StatusFilter = Literal["draft", "issued", "part paid", "paid", "overdue", "void"]

NOT_WON = "Only a won deal can have an invoice."
ALREADY_HAS = "This deal already has an invoice that isn't void."
LINES_MUST_ADD_UP = "The lines must add up to the deal's value."
DESCRIPTION_REQUIRED = "Each line needs a description."
ONLY_DRAFT_CHANGED = "Only a draft can be changed."
ONLY_DRAFT_DELETED = "Only a draft can be deleted."
ONLY_ISSUED_VOIDED = "Only an issued invoice can be voided."
ONLY_ISSUED_TAKES_PAYMENTS = "Only an issued invoice takes payments."
ONLY_ISSUED_PDF = "Only an issued invoice has a PDF."
HAS_PAYMENTS = (
    "This invoice has payments, so it can't be voided. Delete its payments first."
)
PAYMENT_AMOUNT = "A payment must be more than zero and no more than what is still owed."
PAYMENT_DATE = "A payment can't be dated in the future."

PaymentMethod = Literal["bank_transfer", "card", "check", "cash", "other"]

BILL_TO_COLUMNS = (
    "bill_to_name",
    "bill_to_address",
    "bill_to_contact_name",
    "bill_to_contact_email",
)


class LineIn(BaseModel):
    product_id: int | None = None
    description: str = Field(min_length=1)
    quantity: StrictInt
    unit_price_cents: StrictInt


class LinesIn(BaseModel):
    lines: list[LineIn] = Field(min_length=1)


class InvoiceCreateIn(BaseModel):
    deal_id: int
    # The form's lines, or none for the default: one line of the whole value.
    lines: list[LineIn] | None = None


class IssueIn(BaseModel):
    issue_date: date


class PaymentIn(BaseModel):
    paid_on: date
    amount_cents: StrictInt
    method: PaymentMethod
    reference: str | None = None


@router.get("")
def list_invoices(
    q: str | None = None,
    status: StatusFilter | None = None,
    deal_id: int | None = None,
    organization_id: int | None = None,
    sort: SortField = "id",
    order: SortOrder = "asc",
) -> list[dict]:
    """Every invoice, with its worked-out status and balance.

    The search covers the number, the organization and the deal. A draft shows
    no number and no balance, and a void invoice shows no balance.
    """
    with db.get_engine().connect() as connection:
        rows = (
            connection.execute(_filtered(q, deal_id, organization_id)).mappings().all()
        )
        replies = _replies(connection, [dict(row) for row in rows])
    if status is not None:
        replies = [reply for reply in replies if reply["status"] == status]
    return _sorted(replies, sort, order)


@router.post("", status_code=201)
def create_invoice(
    payload: InvoiceCreateIn, user: str = Depends(auth.current_user)
) -> dict:
    """Start the invoice for a won deal: one line of the whole value, or the
    lines the form saved, which must add up to the same thing."""
    with db.get_engine().begin() as connection:
        deal = read_or_404(connection, db.deals, payload.deal_id, "Deal")
        if deal["stage"] != "Won":
            raise HTTPException(status_code=400, detail=NOT_WON)
        _refuse_second_invoice(connection, deal["id"])
        settings = documents.current_settings(connection)
        if payload.lines is None:
            rows = [_whole_value_line(deal)]
        else:
            rows = _checked_lines(payload.lines, deal["value_cents"])
            _require_products(connection, rows)
        _checked_totals(rows, settings["tax_rate_thousandths"])
        invoice_id = _insert_invoice(connection, deal, rows, user)
        return _one(connection, invoice_id)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int) -> dict:
    with db.get_engine().connect() as connection:
        return _one(connection, invoice_id)


@router.put("/{invoice_id}")
def update_invoice(
    invoice_id: int, payload: LinesIn, user: str = Depends(auth.current_user)
) -> dict:
    """Replace a draft's lines, again and again, while it is a draft."""
    with db.get_engine().begin() as connection:
        invoice = _locked_invoice(connection, invoice_id)
        if invoice["status"] != invoice_state.DRAFT:
            raise HTTPException(status_code=409, detail=ONLY_DRAFT_CHANGED)
        deal = read_or_404(connection, db.deals, invoice["deal_id"], "Deal")
        rows = _checked_lines(payload.lines, deal["value_cents"])
        _require_products(connection, rows)
        settings = documents.current_settings(connection)
        _checked_totals(rows, settings["tax_rate_thousandths"])
        _replace_lines(connection, invoice, rows, user)
        return _one(connection, invoice_id)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, user: str = Depends(auth.current_user)) -> dict:
    """Delete a draft, its lines and nothing else."""
    with db.get_engine().begin() as connection:
        invoice = _locked_invoice(connection, invoice_id)
        if invoice["status"] != invoice_state.DRAFT:
            raise HTTPException(status_code=409, detail=ONLY_DRAFT_DELETED)
        descriptions = [
            line["description"]
            for line in _lines(connection, invoice_id, with_ids=False)
        ]
        connection.execute(
            db.invoice_lines.delete().where(db.invoice_lines.c.invoice_id == invoice_id)
        )
        connection.execute(db.invoices.delete().where(db.invoices.c.id == invoice_id))
    return {"lines": descriptions, "counts": {"lines": len(descriptions)}}


@router.post("/{invoice_id}/issue")
def issue_invoice(
    invoice_id: int, payload: IssueIn, user: str = Depends(auth.current_user)
) -> dict:
    """Give a draft its number and freeze it.

    The number is taken inside the saving transaction, so a failed save gives
    its number back. The snapshots — the tax label and rate and the Bill to
    block — and the totals are the ones stored here, and nothing on the
    invoice moves again.
    """
    with db.get_engine().begin() as connection:
        invoice = _locked_invoice(connection, invoice_id)
        if invoice["status"] != invoice_state.DRAFT:
            raise HTTPException(status_code=409, detail=ONLY_DRAFT_CHANGED)
        settings = documents.current_settings(connection)
        totals = _checked_totals(
            _lines(connection, invoice_id, with_ids=False),
            settings["tax_rate_thousandths"],
        )
        changed = connection.execute(
            db.invoices.update()
            .where(
                db.invoices.c.id == invoice_id,
                db.invoices.c.status == invoice_state.DRAFT,
            )
            .values(
                number=documents.take_number(connection, "invoice"),
                status=invoice_state.ISSUED,
                issue_date=payload.issue_date,
                due_date=payload.issue_date
                + timedelta(days=settings["payment_terms_days"]),
                tax_label=settings["tax_label"],
                tax_rate_thousandths=settings["tax_rate_thousandths"],
                tax_cents=totals.tax_cents,
                total_cents=totals.total_cents,
                **_bill_to(connection, invoice),
                updated_by=user,
            )
        )
        if changed.rowcount == 0:
            raise HTTPException(status_code=409, detail=ONLY_DRAFT_CHANGED)
        return _one(connection, invoice_id)


@router.post("/{invoice_id}/void")
def void_invoice(invoice_id: int, user: str = Depends(auth.current_user)) -> dict:
    """Void an issued invoice with no payments: kept for the record, number and all."""
    with db.get_engine().begin() as connection:
        invoice = _locked_invoice(connection, invoice_id)
        if invoice["status"] != invoice_state.ISSUED:
            raise HTTPException(status_code=409, detail=ONLY_ISSUED_VOIDED)
        payments = connection.execute(
            select(func.count())
            .select_from(db.payments)
            .where(db.payments.c.invoice_id == invoice_id)
        ).scalar_one()
        if payments:
            raise HTTPException(status_code=409, detail=HAS_PAYMENTS)
        changed = connection.execute(
            db.invoices.update()
            .where(
                db.invoices.c.id == invoice_id,
                db.invoices.c.status == invoice_state.ISSUED,
            )
            .values(status=invoice_state.VOID, updated_by=user)
        )
        if changed.rowcount == 0:
            raise HTTPException(status_code=409, detail=ONLY_ISSUED_VOIDED)
        return _one(connection, invoice_id)


@router.get("/{invoice_id}/pdf")
def download_pdf(invoice_id: int) -> Response:
    """The invoice's PDF, made at this moment and named after its number."""
    with db.get_engine().connect() as connection:
        invoice = _one(connection, invoice_id)
        if invoice["status"] == invoice_state.DRAFT:
            raise HTTPException(status_code=409, detail=ONLY_ISSUED_PDF)
        settings = documents.current_settings(connection)
    data = invoice_pdf.build(invoice, settings)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice["number"]}.pdf"'
        },
    )


@router.post("/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: int, payload: PaymentIn, user: str = Depends(auth.current_user)
) -> dict:
    """Record money that arrived against an issued invoice, and who entered it."""
    with db.get_engine().begin() as connection:
        invoice = _locked_invoice(connection, invoice_id)
        if invoice["status"] != invoice_state.ISSUED:
            raise HTTPException(status_code=409, detail=ONLY_ISSUED_TAKES_PAYMENTS)
        _checked_payment(connection, invoice, payload)
        connection.execute(
            db.payments.insert().values(
                invoice_id=invoice_id,
                paid_on=payload.paid_on,
                amount_cents=payload.amount_cents,
                method=payload.method,
                reference=_text(payload.reference),
                created_by=user,
            )
        )
        return _one(connection, invoice_id)


@router.delete("/{invoice_id}/payments/{payment_id}")
def delete_payment(
    invoice_id: int, payment_id: int, user: str = Depends(auth.current_user)
) -> dict:
    """Delete a payment entered by mistake; the balance goes back up."""
    with db.get_engine().begin() as connection:
        _locked_invoice(connection, invoice_id)
        payment = read_or_404(connection, db.payments, payment_id, "Payment")
        if payment["invoice_id"] != invoice_id:
            raise HTTPException(status_code=404, detail="Payment not found")
        connection.execute(db.payments.delete().where(db.payments.c.id == payment_id))
        return _one(connection, invoice_id)


def _checked_payment(connection, invoice: dict, payload: PaymentIn) -> None:
    if payload.paid_on > date.today():
        raise HTTPException(status_code=400, detail=PAYMENT_DATE)
    if payload.amount_cents <= 0:
        raise HTTPException(status_code=400, detail=PAYMENT_AMOUNT)
    owed = invoice_state.balance(
        invoice["total_cents"], _paid_cents(connection, invoice["id"])
    )
    if payload.amount_cents > owed:
        raise HTTPException(status_code=400, detail=PAYMENT_AMOUNT)


def _text(value: str | None) -> str | None:
    """Optional text trimmed, with a blank becoming nothing."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _paid_cents(connection, invoice_id: int) -> int:
    return _paid_by_invoice(connection, [invoice_id]).get(invoice_id, 0)


def _whole_value_line(deal: dict) -> dict:
    """The one line a new invoice starts with: the whole deal's value."""
    return {
        "product_id": None,
        "description": deal["name"],
        "quantity": 1,
        "unit_price_cents": deal["value_cents"],
        "position": 0,
    }


class LineValues(NamedTuple):
    """The two fields the sums read off a line."""

    quantity: int
    unit_price_cents: int


def _locked_invoice(connection, invoice_id: int) -> dict:
    """The invoice, after taking its row for this transaction.

    The no-op update is the lock on both databases: it begins SQLite's write
    transaction and takes the row on Postgres, so the state read after it
    cannot change under another request's write. Two issues, an edit and an
    issue, or a payment and a void then take turns, and the second sees the
    first's committed state.
    """
    locked = connection.execute(
        db.invoices.update()
        .where(db.invoices.c.id == invoice_id)
        .values(updated_by=db.invoices.c.updated_by)
    )
    if locked.rowcount == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return read_or_404(connection, db.invoices, invoice_id, "Invoice")


def _totals(lines: list[dict], rate_thousandths: int) -> tax.Totals:
    sums = [LineValues(row["quantity"], row["unit_price_cents"]) for row in lines]
    return tax.totals(sums, rate_thousandths)


def _checked_totals(lines: list[dict], rate_thousandths: int) -> tax.Totals:
    """The sums, refused if the tax or total would leave the money columns."""
    sums = _totals(lines, rate_thousandths)
    if (
        sums.subtotal_cents > tax.MAX_AMOUNT_CENTS
        or sums.tax_cents > tax.MAX_AMOUNT_CENTS
        or sums.total_cents > tax.MAX_AMOUNT_CENTS
    ):
        raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
    return sums


def _checked_lines(lines: list[LineIn], deal_value_cents: int) -> list[dict]:
    """Each line checked and trimmed, then held to the deal's value."""
    rows = [_checked_line(line, position) for position, line in enumerate(lines)]
    subtotal = sum(
        tax.line_amount(row["quantity"], row["unit_price_cents"]) for row in rows
    )
    if subtotal > tax.MAX_AMOUNT_CENTS:
        raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
    if subtotal != deal_value_cents:
        raise HTTPException(status_code=400, detail=LINES_MUST_ADD_UP)
    return rows


def _checked_line(line: LineIn, position: int) -> dict:
    description = line.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail=DESCRIPTION_REQUIRED)
    if not 1 <= line.quantity <= tax.MAX_QUANTITY:
        raise HTTPException(status_code=400, detail=tax.QUANTITY_MESSAGE)
    amount = tax.line_amount(line.quantity, line.unit_price_cents)
    if not 0 <= line.unit_price_cents <= tax.MAX_AMOUNT_CENTS:
        raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
    if amount > tax.MAX_AMOUNT_CENTS:
        raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
    return {
        "product_id": line.product_id,
        "description": description,
        "quantity": line.quantity,
        "unit_price_cents": line.unit_price_cents,
        "position": position,
    }


def _require_products(connection, rows: list[dict]) -> None:
    for row in rows:
        if row["product_id"] is not None:
            require_exists(connection, db.products, row["product_id"], "Product")


def _refuse_second_invoice(connection, deal_id: int) -> None:
    """A deal takes one invoice that isn't void, checked here and by the index."""
    found = connection.execute(
        select(func.count())
        .select_from(db.invoices)
        .where(
            db.invoices.c.deal_id == deal_id,
            db.invoices.c.status != invoice_state.VOID,
        )
    ).scalar_one()
    if found:
        raise HTTPException(status_code=409, detail=ALREADY_HAS)


def _insert_invoice(connection, deal: dict, rows: list[dict], user: str) -> int:
    values = stamp_created(
        {
            "deal_id": deal["id"],
            "organization_id": deal["organization_id"],
            "status": invoice_state.DRAFT,
            "subtotal_cents": sum(
                tax.line_amount(row["quantity"], row["unit_price_cents"])
                for row in rows
            ),
        },
        user,
    )
    try:
        result = connection.execute(db.invoices.insert().values(**values))
    except IntegrityError:
        # A second invoice for the same deal landed at the same moment and the
        # partial unique index refused it.
        raise HTTPException(status_code=409, detail=ALREADY_HAS) from None
    invoice_id = db.inserted_id(result)
    _insert_lines(connection, invoice_id, rows)
    return invoice_id


def _insert_lines(connection, invoice_id: int, rows: list[dict]) -> None:
    for row in rows:
        connection.execute(
            db.invoice_lines.insert().values(invoice_id=invoice_id, **row)
        )


def _replace_lines(connection, invoice: dict, rows: list[dict], user: str) -> None:
    """The new lines, and who last changed the draft — only when one differs."""
    invoice_id = invoice["id"]
    old = _lines(connection, invoice_id, with_ids=False)
    if _signatures(old) == _signatures(rows):
        return
    connection.execute(
        db.invoice_lines.delete().where(db.invoice_lines.c.invoice_id == invoice_id)
    )
    _insert_lines(connection, invoice_id, rows)
    # The lines differ here, so the save changed something: credit the user.
    connection.execute(
        db.invoices.update()
        .where(db.invoices.c.id == invoice_id)
        .values(updated_by=user)
    )


def _signatures(rows: list[dict]) -> list[tuple]:
    return [
        (
            row["product_id"],
            row["description"],
            row["quantity"],
            row["unit_price_cents"],
            row["position"],
        )
        for row in rows
    ]


def _bill_to(connection, invoice: dict) -> dict:
    """The Bill to block as it reads right now, stored when the invoice issues."""
    organization = read_or_404(
        connection, db.organizations, invoice["organization_id"], "Organization"
    )
    deal = read_or_404(connection, db.deals, invoice["deal_id"], "Deal")
    contact = None
    if deal["contact_id"] is not None:
        contact = read_or_404(connection, db.contacts, deal["contact_id"], "Contact")
    return {
        "bill_to_name": organization["name"],
        "bill_to_address": organization["billing_address"],
        "bill_to_contact_name": contact["name"] if contact else None,
        "bill_to_contact_email": contact["email"] if contact else None,
    }


def _filtered(q: str | None, deal_id: int | None, organization_id: int | None):
    stmt = _select_rows()
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                db.invoices.c.number.like(pattern),
                db.organizations.c.name.like(pattern),
                db.deals.c.name.like(pattern),
            )
        )
    if deal_id is not None:
        stmt = stmt.where(db.invoices.c.deal_id == deal_id)
    if organization_id is not None:
        stmt = stmt.where(db.invoices.c.organization_id == organization_id)
    return stmt.order_by(db.invoices.c.id)


def _select_rows():
    return (
        select(
            db.invoices,
            db.deals.c.name.label("deal_name"),
            db.organizations.c.name.label("organization_name"),
            db.organizations.c.billing_address.label("organization_billing_address"),
            db.contacts.c.name.label("contact_name"),
            db.contacts.c.email.label("contact_email"),
        )
        .join(db.deals, db.invoices.c.deal_id == db.deals.c.id)
        .join(
            db.organizations,
            db.invoices.c.organization_id == db.organizations.c.id,
        )
        .join(db.contacts, db.deals.c.contact_id == db.contacts.c.id, isouter=True)
    )


def _replies(connection, rows: list[dict]) -> list[dict]:
    settings = documents.current_settings(connection)
    today = date.today()
    ids = [row["id"] for row in rows]
    lines = _lines_by_invoice(connection, ids)
    paid = _paid_by_invoice(connection, ids)
    return [
        _reply_row(
            row, lines.get(row["id"], []), paid.get(row["id"], 0), settings, today
        )
        for row in rows
    ]


def _one(connection, invoice_id: int) -> dict:
    row = (
        connection.execute(_select_rows().where(db.invoices.c.id == invoice_id))
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    [reply] = _replies(connection, [dict(row)])
    reply["lines"] = _lines(connection, invoice_id)
    reply["payments"] = _payments(connection, invoice_id)
    return reply


def _reply_row(
    row: dict, lines: list[dict], paid_cents: int, settings: dict, today: date
) -> dict:
    """One invoice as the API shows it: the sums, the one status and the balance.

    A draft's tax follows the current settings and its Bill to block reads as
    the organization and contact do now; an issued or void invoice carries the
    values frozen at issue.
    """
    stored = row["status"] != invoice_state.DRAFT
    if stored:
        label = row["tax_label"]
        rate = row["tax_rate_thousandths"]
        subtotal_cents = row["subtotal_cents"]
        tax_cents = row["tax_cents"]
        total_cents = row["total_cents"]
        bill_to = {name: row[name] for name in BILL_TO_COLUMNS}
    else:
        label = settings["tax_label"]
        rate = settings["tax_rate_thousandths"]
        sums = _totals(lines, rate)
        subtotal_cents = sums.subtotal_cents
        tax_cents = sums.tax_cents
        total_cents = sums.total_cents
        bill_to = {
            "bill_to_name": row["organization_name"],
            "bill_to_address": row["organization_billing_address"],
            "bill_to_contact_name": row["contact_name"],
            "bill_to_contact_email": row["contact_email"],
        }
    status = invoice_state.display_status(
        row["status"], total_cents, paid_cents, row["due_date"], today
    )
    balance_cents = None
    if row["status"] not in (invoice_state.DRAFT, invoice_state.VOID):
        balance_cents = invoice_state.balance(total_cents, paid_cents)
    reply = {
        key: row[key]
        for key in (
            "id",
            "number",
            "deal_id",
            "organization_id",
            "deal_name",
            "organization_name",
            "issue_date",
            "due_date",
            "created_by",
            "updated_by",
        )
    }
    return {
        **reply,
        "status": status,
        "subtotal_cents": subtotal_cents,
        "tax_label": label,
        "tax_rate_thousandths": rate,
        "tax_cents": tax_cents,
        "total_cents": total_cents,
        "paid_cents": paid_cents,
        "balance_cents": balance_cents,
        **bill_to,
    }


def _sorted(replies: list[dict], sort: SortField, order: SortOrder) -> list[dict]:
    ordered = sorted(replies, key=lambda reply: reply["id"])
    return sorted(
        ordered,
        key=lambda reply: (reply[sort] is None, reply[sort]),
        reverse=order == "desc",
    )


def _lines(connection, invoice_id: int, with_ids: bool = True) -> list[dict]:
    rows = _lines_by_invoice(connection, [invoice_id]).get(invoice_id, [])
    if with_ids:
        return rows
    return [_without_ids(row) for row in rows]


def _without_ids(row: dict) -> dict:
    return {key: value for key, value in row.items() if key not in ("id", "invoice_id")}


def _lines_by_invoice(connection, invoice_ids: list[int]) -> dict[int, list[dict]]:
    if not invoice_ids:
        return {}
    rows = connection.execute(
        select(db.invoice_lines)
        .where(db.invoice_lines.c.invoice_id.in_(invoice_ids))
        .order_by(db.invoice_lines.c.position, db.invoice_lines.c.id)
    ).mappings()
    found: dict[int, list[dict]] = {}
    for row in rows:
        found.setdefault(row["invoice_id"], []).append(dict(row))
    return found


def _paid_by_invoice(connection, invoice_ids: list[int]) -> dict[int, int]:
    if not invoice_ids:
        return {}
    rows = connection.execute(
        select(
            db.payments.c.invoice_id,
            func.coalesce(func.sum(db.payments.c.amount_cents), 0),
        )
        .where(db.payments.c.invoice_id.in_(invoice_ids))
        .group_by(db.payments.c.invoice_id)
    ).all()
    return {invoice_id: paid for invoice_id, paid in rows}


def _payments(connection, invoice_id: int) -> list[dict]:
    rows = (
        connection.execute(
            select(db.payments)
            .where(db.payments.c.invoice_id == invoice_id)
            .order_by(db.payments.c.paid_on, db.payments.c.id)
        )
        .mappings()
        .all()
    )
    return [dict(row) for row in rows]
