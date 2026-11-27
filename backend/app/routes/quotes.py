"""Quotes: one document on a deal, from draft to sent and answered.

The backend works out every amount through tax.py and never trusts a total
from the browser; a number comes from documents.take_number inside the save's
own transaction; accepting a quote moves the deal through the board rules in
stages.py. Expired is a view, never stored: a sent quote past its valid-until
date shows and totals as expired.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select

from app import auth, db, documents, quote_pdf, stages, tax
from app.holds import Hold
from app.records import read_or_404, stamp_created, stamp_updated

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

# One hold covers both the deal and the organization: the organization delete
# already passes its deals as targets, and holding() counts a quote once.
HOLDS: tuple[Hold, ...] = (Hold(link=db.quotes.c.deal_id, noun="quote"),)

OPEN_STAGES = ("New", "Qualified", "Proposal", "Negotiation")
DISPLAY_STATES = ("draft", "sent", "expired", "accepted", "declined")

VALID_DAYS = 30
"""A quote is valid for 30 days from the day it is created."""

NO_LINES = "A quote needs at least one line."
PRICE_MESSAGE = "Enter a price from $0.00 to $21,474,836.47."
ARCHIVED_PRODUCT = "Only active products can be added to a quote."
NOT_OPEN_DEAL = "A quote can only be created on an open deal."
ONLY_DRAFT = "Only a draft can be changed."
ONLY_DRAFT_SEND = "Only a draft can be sent."
ONLY_SENT_ANSWER = "Only a sent quote can be accepted or declined."
DEAL_ALREADY_ACCEPTED = "This deal already has an accepted quote."
ONLY_FINAL_COPY = "Only a quote that is no longer a draft can be copied."
ONLY_FINAL_PDF = "A draft has no PDF; it is downloaded once the quote is sent."


class LineIn(BaseModel):
    product_id: int
    description: str | None = None
    quantity: int
    unit_price_cents: int


class QuoteIn(BaseModel):
    deal_id: int
    valid_until: date | None = None
    lines: list[LineIn]


class QuoteUpdateIn(BaseModel):
    valid_until: date | None = None
    lines: list[LineIn]


def _base_stmt():
    return (
        select(
            db.quotes,
            db.deals.c.name.label("deal_name"),
            db.deals.c.organization_id,
            db.organizations.c.name.label("organization_name"),
        )
        .select_from(db.quotes)
        .join(db.deals, db.quotes.c.deal_id == db.deals.c.id)
        .join(
            db.organizations,
            db.deals.c.organization_id == db.organizations.c.id,
            isouter=True,
        )
    )


def _read_row(connection, quote_id: int) -> dict:
    row = (
        connection.execute(_base_stmt().where(db.quotes.c.id == quote_id))
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    return dict(row)


def _line_rows(connection, quote_id: int) -> list[dict]:
    rows = connection.execute(
        select(db.quote_lines)
        .where(db.quote_lines.c.quote_id == quote_id)
        .order_by(db.quote_lines.c.position)
    ).mappings()
    return [dict(row) for row in rows]


def _displayed_status(quote: dict, today: date) -> str:
    """The state the app shows: a sent quote past its date is expired."""
    if quote["status"] == "sent" and today > quote["valid_until"]:
        return "expired"
    return quote["status"]


def _row(quote: dict, lines: list[dict], settings: dict) -> dict:
    """One list row: the names read live, the sums and the state it shows."""
    label, rate = quote_pdf.effective_tax(quote, settings)
    sums = tax.totals(
        [
            quote_pdf.Priced(line["quantity"], line["unit_price_cents"])
            for line in lines
        ],
        rate,
    )
    return {
        "id": quote["id"],
        "number": quote["number"],
        "deal_id": quote["deal_id"],
        "deal_name": quote["deal_name"],
        "organization_id": quote["organization_id"],
        "organization_name": quote["organization_name"],
        "status": _displayed_status(quote, date.today()),
        "created_at": quote["created_at"],
        "valid_until": quote["valid_until"],
        "tax_label": label,
        "tax_rate_thousandths": rate,
        "subtotal_cents": sums.subtotal_cents,
        "tax_cents": sums.tax_cents,
        "total_cents": sums.total_cents,
        "created_by": quote["created_by"],
        "updated_by": quote["updated_by"],
    }


def _detail(connection, quote: dict) -> dict:
    lines = _line_rows(connection, quote["id"])
    settings = documents.current_settings(connection)
    document = quote_pdf.quote_document(connection, quote, lines)
    return {
        **_row(quote, lines, settings),
        "lines": document["lines"],
        "company": document["company"],
        "contact_name": document["customer"]["contact"],
    }


def _totals(rows: list[dict]) -> dict[str, int]:
    """The five totals, each quote counted once, in the state it shows."""
    totals = dict.fromkeys(DISPLAY_STATES, 0)
    for row in rows:
        totals[row["status"]] += row["total_cents"]
    return totals


def _checked_lines(
    connection, lines: list[LineIn], kept_names: dict[int, str]
) -> list[dict]:
    """The lines as rows, refusing bad bounds and products that can't be added.

    ``kept_names`` maps the products already on the quote to the name each line
    snapshotted: those lines stay whatever became of their product, and only a
    newly added line needs an active product.
    """
    if not lines:
        raise HTTPException(status_code=400, detail=NO_LINES)
    rows = []
    subtotal = 0
    for line in lines:
        if not 1 <= line.quantity <= tax.MAX_QUANTITY:
            raise HTTPException(status_code=400, detail=tax.QUANTITY_MESSAGE)
        if not 0 <= line.unit_price_cents <= tax.MAX_AMOUNT_CENTS:
            raise HTTPException(status_code=400, detail=PRICE_MESSAGE)
        amount = tax.line_amount(line.quantity, line.unit_price_cents)
        if amount > tax.MAX_AMOUNT_CENTS:
            raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
        subtotal += amount
        rows.append(
            {
                **line.model_dump(),
                "product_name": _product_name(connection, line.product_id, kept_names),
            }
        )
    if subtotal > tax.MAX_AMOUNT_CENTS:
        raise HTTPException(status_code=400, detail=tax.AMOUNT_MESSAGE)
    return rows


def _product_name(connection, product_id: int, kept_names: dict[int, str]) -> str:
    """The name a new line snapshots; a line already on the quote keeps its own."""
    if product_id in kept_names:
        return kept_names[product_id]
    product = read_or_404(connection, db.products, product_id, "Product")
    if not product["active"]:
        raise HTTPException(status_code=400, detail=ARCHIVED_PRODUCT)
    return product["name"]


def _insert_lines(connection, quote_id: int, rows: list[dict]) -> None:
    for position, row in enumerate(rows):
        connection.execute(
            db.quote_lines.insert().values(quote_id=quote_id, position=position, **row)
        )


def _line_values(rows: list[dict]) -> list[tuple]:
    """What a line stores, in order: the shape a no-op save compares."""
    return [
        (
            row["product_id"],
            row["product_name"],
            row["description"],
            row["quantity"],
            row["unit_price_cents"],
        )
        for row in rows
    ]


@router.get("")
def list_quotes(deal_id: int | None = None, organization_id: int | None = None) -> dict:
    """Every quote, or one deal's or organization's; unfiltered, the totals too."""
    with db.get_engine().connect() as connection:
        settings = documents.current_settings(connection)
        stmt = _base_stmt()
        if deal_id is not None:
            stmt = stmt.where(db.quotes.c.deal_id == deal_id)
        if organization_id is not None:
            stmt = stmt.where(db.deals.c.organization_id == organization_id)
        quotes = [
            dict(row)
            for row in connection.execute(stmt.order_by(db.quotes.c.id)).mappings()
        ]
        lines = _lines_by_quote(connection, [quote["id"] for quote in quotes])
        rows = [_row(quote, lines.get(quote["id"], []), settings) for quote in quotes]
    reply: dict = {"quotes": rows}
    if deal_id is None and organization_id is None:
        reply["totals"] = _totals(rows)
    return reply


def _lines_by_quote(connection, quote_ids: list[int]) -> dict[int, list[dict]]:
    if not quote_ids:
        return {}
    rows = connection.execute(
        select(db.quote_lines)
        .where(db.quote_lines.c.quote_id.in_(quote_ids))
        .order_by(db.quote_lines.c.quote_id, db.quote_lines.c.position)
    ).mappings()
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["quote_id"], []).append(dict(row))
    return grouped


@router.get("/{quote_id}")
def get_quote(quote_id: int) -> dict:
    with db.get_engine().connect() as connection:
        return _detail(connection, _read_row(connection, quote_id))


@router.post("", status_code=201)
def create_quote(payload: QuoteIn, user: str = Depends(auth.current_user)) -> dict:
    with db.get_engine().begin() as connection:
        deal = read_or_404(connection, db.deals, payload.deal_id, "Deal")
        if deal["stage"] not in OPEN_STAGES:
            raise HTTPException(status_code=400, detail=NOT_OPEN_DEAL)
        rows = _checked_lines(connection, payload.lines, {})
        created = date.today()
        values = {
            "number": documents.take_number(connection, "quote"),
            "deal_id": deal["id"],
            "status": "draft",
            "created_at": created,
            "valid_until": payload.valid_until or created + timedelta(days=VALID_DAYS),
            "tax_label": None,
            "tax_rate_thousandths": None,
        }
        result = connection.execute(
            db.quotes.insert().values(**stamp_created(values, user))
        )
        quote_id = db.inserted_id(result)
        _insert_lines(connection, quote_id, rows)
        return _detail(connection, _read_row(connection, quote_id))


@router.put("/{quote_id}")
def update_quote(
    quote_id: int, payload: QuoteUpdateIn, user: str = Depends(auth.current_user)
) -> dict:
    with db.get_engine().begin() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] != "draft":
            raise HTTPException(status_code=400, detail=ONLY_DRAFT)
        existing = _line_rows(connection, quote_id)
        kept_names = {row["product_id"]: row["product_name"] for row in existing}
        rows = _checked_lines(connection, payload.lines, kept_names)
        valid_until = payload.valid_until or quote["created_at"] + timedelta(
            days=VALID_DAYS
        )
        values: dict = {"valid_until": valid_until}
        if valid_until != quote["valid_until"] or _line_values(rows) != _line_values(
            existing
        ):
            values["updated_by"] = user
        connection.execute(
            db.quotes.update().where(db.quotes.c.id == quote_id).values(**values)
        )
        connection.execute(
            db.quote_lines.delete().where(db.quote_lines.c.quote_id == quote_id)
        )
        _insert_lines(connection, quote_id, rows)
        return _detail(connection, _read_row(connection, quote_id))


@router.post("/{quote_id}/send")
def send_quote(quote_id: int, user: str = Depends(auth.current_user)) -> dict:
    """Mark a draft sent: the tax it carries freezes here, for good."""
    with db.get_engine().begin() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] != "draft":
            raise HTTPException(status_code=400, detail=ONLY_DRAFT_SEND)
        settings = documents.current_settings(connection)
        connection.execute(
            db.quotes.update()
            .where(db.quotes.c.id == quote_id)
            .values(
                status="sent",
                tax_label=settings["tax_label"],
                tax_rate_thousandths=settings["tax_rate_thousandths"],
                updated_by=user,
            )
        )
        return _detail(connection, _read_row(connection, quote_id))


@router.post("/{quote_id}/accept")
def accept_quote(quote_id: int, user: str = Depends(auth.current_user)) -> dict:
    """Mark a sent quote accepted: the deal is won, at the quote's value."""
    with db.get_engine().begin() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] != "sent":
            raise HTTPException(status_code=400, detail=ONLY_SENT_ANSWER)
        if _accepted_on(connection, quote["deal_id"]) is not None:
            raise HTTPException(status_code=400, detail=DEAL_ALREADY_ACCEPTED)
        connection.execute(
            db.quotes.update()
            .where(db.quotes.c.id == quote_id)
            .values(status="accepted", updated_by=user)
        )
        subtotal_cents = _subtotal(connection, quote_id)
        # The board move, exactly as a drag to Won would land it.
        stages.move(connection, quote["deal_id"], "Won", None, user)
        deal = read_or_404(connection, db.deals, quote["deal_id"], "Deal")
        won = stamp_updated(
            deal, {"value_cents": _won_value_cents(subtotal_cents)}, user
        )
        connection.execute(
            db.deals.update().where(db.deals.c.id == deal["id"]).values(**won)
        )
        return _detail(connection, _read_row(connection, quote_id))


@router.post("/{quote_id}/decline")
def decline_quote(quote_id: int, user: str = Depends(auth.current_user)) -> dict:
    """Mark a sent quote declined: nothing but the quote changes."""
    with db.get_engine().begin() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] != "sent":
            raise HTTPException(status_code=400, detail=ONLY_SENT_ANSWER)
        connection.execute(
            db.quotes.update()
            .where(db.quotes.c.id == quote_id)
            .values(status="declined", updated_by=user)
        )
        return _detail(connection, _read_row(connection, quote_id))


@router.post("/{quote_id}/copy", status_code=201)
def copy_quote(quote_id: int, user: str = Depends(auth.current_user)) -> dict:
    """A fresh draft from a quote that is no longer one: new number, same lines."""
    with db.get_engine().begin() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] == "draft":
            raise HTTPException(status_code=400, detail=ONLY_FINAL_COPY)
        created = date.today()
        values = {
            "number": documents.take_number(connection, "quote"),
            "deal_id": quote["deal_id"],
            "status": "draft",
            "created_at": created,
            "valid_until": created + timedelta(days=VALID_DAYS),
            "tax_label": None,
            "tax_rate_thousandths": None,
        }
        result = connection.execute(
            db.quotes.insert().values(**stamp_created(values, user))
        )
        copy_id = db.inserted_id(result)
        for line in _line_rows(connection, quote_id):
            connection.execute(
                db.quote_lines.insert().values(
                    quote_id=copy_id,
                    product_id=line["product_id"],
                    product_name=line["product_name"],
                    description=line["description"],
                    quantity=line["quantity"],
                    unit_price_cents=line["unit_price_cents"],
                    position=line["position"],
                )
            )
        return _detail(connection, _read_row(connection, copy_id))


@router.get("/{quote_id}/pdf")
def download_quote(quote_id: int) -> Response:
    """The customer's PDF, made from the quote's saved values at download."""
    with db.get_engine().connect() as connection:
        quote = read_or_404(connection, db.quotes, quote_id, "Quote")
        if quote["status"] == "draft":
            raise HTTPException(status_code=400, detail=ONLY_FINAL_PDF)
        document = quote_pdf.quote_document(
            connection, quote, _line_rows(connection, quote_id)
        )
    data = quote_pdf.render_pdf(document)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{quote["number"]}.pdf"'
        },
    )


def _accepted_on(connection, deal_id: int) -> dict | None:
    row = (
        connection.execute(
            select(db.quotes).where(
                db.quotes.c.deal_id == deal_id, db.quotes.c.status == "accepted"
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row is not None else None


def _subtotal(connection, quote_id: int) -> int:
    lines = _line_rows(connection, quote_id)
    return sum(
        tax.line_amount(line["quantity"], line["unit_price_cents"]) for line in lines
    )


def _won_value_cents(subtotal_cents: int) -> int:
    """The subtotal before tax as the deal's value: whole dollars, halves up."""
    return ((subtotal_cents + 50) // 100) * 100
