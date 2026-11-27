"""A quote as the customer's document: its rows, and the PDF drawn from them.

``quote_document`` builds the document as plain rows — the company, the
customer, the number and the dates, the lines and the totals — and
``render_pdf`` draws those rows with fpdf2 and the three brand fonts. The seam
keeps the proof of what appears on the PDF in one place. Every string is drawn
as text with fpdf2's markup turned off, so nothing typed is ever interpreted.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import NamedTuple, cast

from fpdf import FPDF
from sqlalchemy import select

from app import db, documents, tax
from app.records import read_or_404

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"

# The customer's paper in both app themes: white, Midnight ink, Sea Green
# accent (docs/specs/look-and-feel.md).
INK = (7, 59, 76)
ACCENT = (6, 214, 160)

TEXT = "InstrumentSans"
TITLE = "InstrumentSerif"
MONEY = "JetBrainsMono"

FONT_FILES = {
    TEXT: "InstrumentSans-Regular.ttf",
    TITLE: "InstrumentSerif-Regular.ttf",
    MONEY: "JetBrainsMono-Regular.ttf",
}

LINE_HEIGHT = 4.2
"""One wrapped line of document text, in millimetres."""


class Priced(NamedTuple):
    """A line as the sums see it: only the quantity and the price."""

    quantity: int
    unit_price_cents: int


def effective_tax(quote: dict, settings: dict) -> tuple[str | None, int]:
    """The tax a document shows: a draft follows the settings as they are now,
    and a quote that was sent kept the tax it was sent with."""
    if quote["status"] == "draft":
        return settings["tax_label"], settings["tax_rate_thousandths"]
    return quote["tax_label"], quote["tax_rate_thousandths"]


def quote_document(connection, quote: dict, lines: list[dict]) -> dict:
    """The quote as plain rows, read live around its saved values.

    The company comes from Settings and the customer from the deal; only the
    lines and the tax are the quote's own. Every amount is worked out here
    from the lines, never taken from anywhere else.
    """
    settings = documents.current_settings(connection)
    deal = read_or_404(connection, db.deals, quote["deal_id"], "Deal")
    label, rate = effective_tax(quote, settings)
    sums = tax.totals(
        [Priced(line["quantity"], line["unit_price_cents"]) for line in lines], rate
    )
    return {
        "company": {
            "name": settings["name"],
            "address": settings["address"],
            "email": settings["email"],
            "phone": settings["phone"],
        },
        "customer": {
            "organization": _name_of(
                connection, db.organizations, deal["organization_id"]
            ),
            "contact": _name_of(connection, db.contacts, deal["contact_id"]),
        },
        "number": quote["number"],
        "created_at": quote["created_at"],
        "valid_until": quote["valid_until"],
        "tax_label": label,
        "tax_rate_thousandths": rate,
        "lines": [
            {
                **dict(line),
                "amount_cents": tax.line_amount(
                    line["quantity"], line["unit_price_cents"]
                ),
            }
            for line in lines
        ],
        "subtotal_cents": sums.subtotal_cents,
        "tax_cents": sums.tax_cents,
        "total_cents": sums.total_cents,
    }


def _name_of(connection, table, row_id: int | None) -> str | None:
    """The record's name, or nothing when there is no record to name."""
    if row_id is None:
        return None
    row = connection.execute(select(table.c.name).where(table.c.id == row_id)).first()
    return row[0] if row is not None else None


def money(cents: int) -> str:
    """A document amount with its currency and two decimals: $1,234.56."""
    dollars, remainder = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{remainder:02d}"


def percent(thousandths: int) -> str:
    """A rate as the document shows it: 8875 as 8.875%, 100 as 0.1%."""
    whole, fraction = divmod(thousandths, 1000)
    if fraction == 0:
        return f"{whole}%"
    return f"{whole}.{f'{fraction:03d}'.rstrip('0')}%"


def date_label(value: date) -> str:
    """A date as the document shows it: Nov 26, 2026."""
    return f"{value.strftime('%b')} {value.day}, {value.year}"


def render_pdf(document: dict) -> bytes:
    """The document's rows drawn as a PDF, one page per screenful."""
    pdf = FPDF(format="Letter", unit="mm")
    for family, filename in FONT_FILES.items():
        pdf.add_font(family, "", FONT_DIR / filename)
    pdf.set_margins(20, 18, 20)
    # Nothing breaks the page on its own: every block is drawn exactly where
    # it says it is, and each block takes a fresh page for itself when it would
    # fall off the bottom of this one (see _fit).
    pdf.set_auto_page_break(False)
    pdf.add_page()
    _draw_head(pdf, document)
    _draw_parties(pdf, document)
    _draw_meta(pdf, document)
    _draw_lines(pdf, document)
    _draw_totals(pdf, document)
    return bytes(pdf.output())


def _fit(pdf: FPDF, height: float, top: float) -> float:
    """Where a block of this height starts: on a fresh page when it would
    fall off the bottom of the page it was about to be drawn on."""
    if top + height <= pdf.page_break_trigger:
        return top
    pdf.add_page()
    return pdf.t_margin


def _text(
    pdf: FPDF,
    x: float,
    y: float,
    width: float,
    size: int,
    row: str,
    font: str = TEXT,
    align: str = "L",
) -> None:
    """One line of document text, at its place, drawn as text only."""
    pdf.set_xy(x, y)
    pdf.set_text_color(*INK)
    pdf.set_font(font, size=size)
    pdf.multi_cell(width, LINE_HEIGHT, row, align=align, markdown=False)


def _wrapped(
    pdf: FPDF, width: float, size: int, row: str, font: str = TEXT
) -> list[str]:
    """How one row of text wraps inside a column."""
    pdf.set_font(font, size=size)
    return cast(
        list[str],
        pdf.multi_cell(
            width, LINE_HEIGHT, row, markdown=False, dry_run=True, output="LINES"
        ),
    )


def _draw_head(pdf: FPDF, document: dict) -> None:
    _text(pdf, pdf.l_margin, pdf.get_y(), pdf.epw, 26, "Quote", font=TITLE)
    rule = pdf.get_y() + 1
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.9)
    pdf.line(pdf.l_margin, rule, pdf.l_margin + pdf.epw, rule)
    pdf.set_y(rule + 7)


def _draw_parties(pdf: FPDF, document: dict) -> None:
    """From and To side by side, the pair as tall as the taller column."""
    half = pdf.epw / 2
    from_cells = _wrap_party(pdf, half, "From", _company_rows(document))
    to_cells = _wrap_party(pdf, half, "To", _customer_rows(document))
    height = max(_party_height(from_cells), _party_height(to_cells))
    top = _fit(pdf, height, pdf.get_y())
    _draw_party(pdf, pdf.l_margin, top, half, from_cells)
    _draw_party(pdf, pdf.l_margin + half, top, half, to_cells)
    pdf.set_y(top + height + 4)


def _company_rows(document: dict) -> list[str]:
    company = document["company"]
    return [
        row
        for row in (
            company["name"],
            company["address"],
            company["email"],
            company["phone"],
        )
        if row
    ]


def _customer_rows(document: dict) -> list[str]:
    customer = document["customer"]
    return [row for row in (customer["organization"], customer["contact"]) if row]


def _wrap_party(
    pdf: FPDF, width: float, label: str, rows: list[str]
) -> list[tuple[int, list[str]]]:
    """One column's label and rows, each wrapped inside it: (size, lines)."""
    cells = [(9, _wrapped(pdf, width, 9, label))]
    for index, row in enumerate(rows):
        size = 11 if index == 0 else 9
        cells.append((size, _wrapped(pdf, width, size, row)))
    return cells


def _party_height(cells: list[tuple[int, list[str]]]) -> float:
    """One column's height: its rows, each on as many lines as it wrapped to."""
    return sum(len(lines) for _, lines in cells) * LINE_HEIGHT


def _draw_party(
    pdf: FPDF, x: float, y: float, width: float, cells: list[tuple[int, list[str]]]
) -> None:
    """One column's cells drawn from its top, one under the last."""
    cursor = y
    for size, lines in cells:
        for line_index, line in enumerate(lines):
            _text(pdf, x, cursor + line_index * LINE_HEIGHT, width, size, line)
        cursor += len(lines) * LINE_HEIGHT


def _draw_meta(pdf: FPDF, document: dict) -> None:
    third = pdf.epw / 3
    height = 2 * LINE_HEIGHT + 5
    top = _fit(pdf, height, pdf.get_y())
    fields = (
        ("Quote number", document["number"], MONEY),
        ("Created", date_label(document["created_at"]), TEXT),
        ("Valid until", date_label(document["valid_until"]), TEXT),
    )
    for index, (label, value, font) in enumerate(fields):
        x = pdf.l_margin + index * third
        _text(pdf, x, top, third, 8, label)
        _text(pdf, x, top + LINE_HEIGHT, third, 10, value, font=font)
    pdf.set_y(top + height)


def _draw_lines(pdf: FPDF, document: dict) -> None:
    """The lines table, its headings repeated on the page it continues on."""
    columns = _line_columns(pdf.epw)
    rows = [_line_cells(pdf, line, columns) for line in document["lines"]]
    heading = 3 * LINE_HEIGHT + (_row_height(rows[0]) if rows else 0)
    top = _table_headings(pdf, _fit(pdf, heading, pdf.get_y()), columns)
    for cells in rows:
        if top + _row_height(cells) > pdf.page_break_trigger:
            pdf.add_page()
            top = _table_headings(pdf, pdf.t_margin, columns)
        top = _draw_line(pdf, cells, columns, top)
    pdf.set_y(top)


def _line_columns(epw: float) -> dict:
    """The lines table's columns: name, description, quantity, price, amount."""
    amount = epw * 0.19
    price = epw * 0.19
    quantity = epw * 0.09
    name = epw * 0.23
    return {
        "product_name": (name, "L"),
        "description": (epw - name - quantity - price - amount, "L"),
        "quantity": (quantity, "R"),
        "unit_price_cents": (price, "R"),
        "amount_cents": (amount, "R"),
    }


LINE_HEADINGS = {
    "product_name": "Product",
    "description": "Description",
    "quantity": "Qty",
    "unit_price_cents": "Unit price",
    "amount_cents": "Amount",
}


def _columns_x(columns: dict, key: str, start: float) -> float:
    x = start
    for name, (width, _) in columns.items():
        if name == key:
            return x
        x += width
    return x


def _table_headings(pdf: FPDF, top: float, columns: dict) -> float:
    """The column headings and their rule: the y the rows start below them."""
    for key, (width, align) in columns.items():
        _text(
            pdf,
            _columns_x(columns, key, pdf.l_margin),
            top,
            width,
            8,
            LINE_HEADINGS[key],
            align=align,
        )
    rule = top + LINE_HEIGHT + 1
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, rule, pdf.l_margin + pdf.epw, rule)
    return rule + 2


def _line_cells(pdf: FPDF, line: dict, columns: dict) -> dict[str, list[str]]:
    """One row of the lines table, every cell wrapped inside its column."""
    return {
        key: _wrapped(pdf, width, 9, _line_cell(line, key))
        for key, (width, _) in columns.items()
    }


def _row_height(cells: dict[str, list[str]]) -> float:
    """One row's height: its tallest cell, every cell on LINE_HEIGHT."""
    return max(len(rows) for rows in cells.values()) * LINE_HEIGHT


def _draw_line(
    pdf: FPDF, cells: dict[str, list[str]], columns: dict, top: float
) -> float:
    """One row's cells drawn from ``top``: the y the next row starts below."""
    for key, (width, align) in columns.items():
        font = (
            MONEY if key in {"quantity", "unit_price_cents", "amount_cents"} else TEXT
        )
        for index, row in enumerate(cells[key]):
            _text(
                pdf,
                _columns_x(columns, key, pdf.l_margin),
                top + index * LINE_HEIGHT,
                width,
                9,
                row,
                font=font,
                align=align,
            )
    return top + _row_height(cells) + 1.5


def _line_cell(line: dict, key: str) -> str:
    if key == "quantity":
        return f"{line['quantity']}"
    if key == "unit_price_cents":
        return money(line["unit_price_cents"])
    if key == "amount_cents":
        return money(line["amount_cents"])
    return line[key] or ""


def _draw_totals(pdf: FPDF, document: dict) -> None:
    """Subtotal, tax and total: kept together, each row as tall as it wraps."""
    label_width = 50
    amount_width = 38
    x = pdf.l_margin + pdf.epw - label_width - amount_width
    rows = _total_rows(document)
    cells = [
        _total_cells(pdf, label_width, amount_width, index, label, amount)
        for index, (label, amount) in enumerate(rows)
    ]
    top = _fit(pdf, _totals_height(cells), pdf.get_y() + 3)
    cursor = top
    for index, (size, label_lines, amount_lines) in enumerate(cells):
        if index == 2:
            pdf.set_draw_color(*ACCENT)
            pdf.set_line_width(0.3)
            pdf.line(x, cursor - 1, x + label_width + amount_width, cursor - 1)
        for line_index, line in enumerate(label_lines):
            _text(pdf, x, cursor + line_index * LINE_HEIGHT, label_width, size, line)
        for line_index, line in enumerate(amount_lines):
            _text(
                pdf,
                x + label_width,
                cursor + line_index * LINE_HEIGHT,
                amount_width,
                size,
                line,
                font=MONEY,
                align="R",
            )
        cursor += max(len(label_lines), len(amount_lines)) * LINE_HEIGHT + 1.5
    pdf.set_y(cursor)


def _total_rows(document: dict) -> list[tuple[str, str]]:
    """The three totals rows as the label and the amount the document shows."""
    tax_label = document["tax_label"] or "Tax"
    return [
        ("Subtotal", money(document["subtotal_cents"])),
        (
            f"{tax_label} ({percent(document['tax_rate_thousandths'])})",
            money(document["tax_cents"]),
        ),
        ("Total", money(document["total_cents"])),
    ]


def _total_cells(
    pdf: FPDF,
    label_width: float,
    amount_width: float,
    index: int,
    label: str,
    amount: str,
) -> tuple[int, list[str], list[str]]:
    """One totals row: its size, its label and its amount, each wrapped."""
    size = 11 if index == 2 else 9
    return (
        size,
        _wrapped(pdf, label_width, size, label),
        _wrapped(pdf, amount_width, size, amount, font=MONEY),
    )


def _totals_height(cells: list[tuple[int, list[str], list[str]]]) -> float:
    return sum(
        max(len(label_lines), len(amount_lines)) * LINE_HEIGHT + 1.5
        for _, label_lines, amount_lines in cells
    )
