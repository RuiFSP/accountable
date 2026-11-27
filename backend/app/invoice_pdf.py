"""The invoice's PDF, drawn when it is downloaded.

One of the three designs from Settings — Classic, Modern or Compact — on the
brand's fonts, with the business's accent color and logo as they are now and
the Bill to block an issued invoice froze. Everything typed onto the invoice
is drawn as text, so markup never reaches the document, and a paid, overdue or
void invoice carries its mark of the moment.
"""

from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace
from PIL import Image, UnidentifiedImageError

FONTS_DIR = Path(__file__).resolve().parent / "fonts"

PAGE_WIDTH = 215.9  # US Letter, portrait, in millimetres
PAGE_HEIGHT = 279.4
MARGIN = 18
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

INK = (7, 59, 76)  # Midnight, the default accent and the document's ink
MUTED = (90, 100, 105)
MARK_GRAY = (212, 216, 218)

MARKS = {"paid": "PAID", "overdue": "OVERDUE", "void": "VOID"}
DESIGNS = ("classic", "modern", "compact")


def build(invoice: dict, settings: dict) -> bytes:
    """The invoice's document, as it reads at this moment."""
    pdf = FPDF(format="letter", unit="mm")
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    # A long invoice continues on another page, with the table's headings
    # repeated by fpdf; the totals move to the last page below.
    pdf.set_auto_page_break(True, margin=MARGIN)
    _fonts(pdf)
    accent = _accent(settings["accent_color"])
    pdf.set_title(invoice["number"] or "Invoice")
    pdf.add_page()
    _mark(pdf, invoice["status"])
    draw = {"classic": _classic, "modern": _modern, "compact": _compact}
    draw[_design(settings)](pdf, invoice, settings, accent)
    return bytes(pdf.output())


def _fonts(pdf: FPDF) -> None:
    pdf.add_font("Sans", "", FONTS_DIR / "InstrumentSans-Regular.ttf")
    pdf.add_font("Sans", "B", FONTS_DIR / "InstrumentSans-Bold.ttf")
    pdf.add_font("Mono", "", FONTS_DIR / "JetBrainsMono-Regular.ttf")
    pdf.add_font("Mono", "B", FONTS_DIR / "JetBrainsMono-Bold.ttf")


def _design(settings: dict) -> str:
    design = settings["invoice_design"]
    return design if design in DESIGNS else "classic"


def _accent(hex_color: str) -> tuple[int, int, int]:
    red, green, blue = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return red, green, blue


def _mark(pdf: FPDF, status: str) -> None:
    """The PAID, OVERDUE or VOID stamp, drawn first so the words sit over it.

    It names its status in text, so no state is ever carried by color alone.
    """
    text = MARKS.get(status)
    if text is None:
        return
    pdf.set_font("Sans", "B", 46)
    pdf.set_text_color(*MARK_GRAY)
    with pdf.rotation(angle=32, x=PAGE_WIDTH / 2, y=PAGE_HEIGHT / 2):
        pdf.set_xy(0, PAGE_HEIGHT / 2 - 8)
        pdf.cell(w=PAGE_WIDTH, text=text, align="C")


def _classic(pdf: FPDF, invoice: dict, settings: dict, accent) -> None:
    """Centred letterhead under one accent rule: the traditional invoice."""
    y = _letterhead(pdf, settings, accent)
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.9)
    pdf.line(MARGIN, y + 3, PAGE_WIDTH - MARGIN, y + 3)
    pdf.set_xy(MARGIN, y + 6)
    pdf.set_font("Sans", "B", 14)
    pdf.set_text_color(*accent)
    pdf.cell(w=CONTENT_WIDTH, text="INVOICE", align="C", new_x="LMARGIN", new_y="NEXT")
    y = _paired(pdf, pdf.get_y() + 5, invoice, meta_width=62)
    y = _lines_table(pdf, y + 8, invoice, accent, head_color=accent, fill=None)
    _totals(pdf, invoice, accent, bold_labels=False)


def _modern(pdf: FPDF, invoice: dict, settings: dict, accent) -> None:
    """Left-aligned and open, under a heavy accent rule, with a filled table head."""
    y = _brand_row(pdf, settings, accent)
    pdf.set_draw_color(*accent)
    pdf.set_line_width(1.4)
    pdf.line(MARGIN, y + 3, PAGE_WIDTH - MARGIN, y + 3)
    pdf.set_xy(MARGIN, y + 8)
    pdf.set_font("Sans", "B", 26)
    pdf.set_text_color(*accent)
    pdf.cell(text="INVOICE", new_x="LMARGIN", new_y="NEXT")
    y = _paired(pdf, pdf.get_y() + 6, invoice, meta_width=70)
    y = _lines_table(pdf, y + 10, invoice, accent, head_color=INK, fill=(232, 236, 238))
    _totals(pdf, invoice, accent, bold_labels=True)


def _compact(pdf: FPDF, invoice: dict, settings: dict, accent) -> None:
    """Everything on one dense sheet, for invoices that run long."""
    y = _compact_header(pdf, settings, accent)
    pdf.set_xy(MARGIN, y + 3)
    pdf.set_font("Sans", "B", 10)
    pdf.set_text_color(*accent)
    pdf.cell(text="INVOICE", new_x="LMARGIN", new_y="NEXT")
    y = _paired(pdf, pdf.get_y() + 2.5, invoice, meta_width=55)
    _lines_table(pdf, y + 4, invoice, accent, head_color=INK, fill=None, tight=True)
    _totals(pdf, invoice, accent, bold_labels=False, tight=True)


def _compact_header(pdf: FPDF, settings: dict, accent) -> float:
    """The logo, the business's name and its details, under one thin rule."""
    y = MARGIN
    name_x = MARGIN
    logo_height = 0
    brand = _logo(settings, 18, 9)
    if brand:
        logo, width, logo_height = brand
        pdf.image(logo, x=MARGIN, y=y, w=width, h=logo_height)
        name_x = MARGIN + width + 3
    pdf.set_xy(name_x, y)
    pdf.set_font("Sans", "B", 12)
    pdf.set_text_color(*accent)
    pdf.cell(text=settings["name"], new_x="LMARGIN", new_y="NEXT")
    y = max(pdf.get_y(), MARGIN + logo_height) + 1.5
    pdf.set_xy(MARGIN, y)
    pdf.set_font("Sans", size=8)
    pdf.set_text_color(*MUTED)
    pdf.cell(
        w=CONTENT_WIDTH,
        text=" · ".join(_contact_lines(settings)),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.5)
    pdf.line(MARGIN, pdf.get_y() + 1.5, PAGE_WIDTH - MARGIN, pdf.get_y() + 1.5)
    return pdf.get_y() + 1.5


def _letterhead(pdf: FPDF, settings: dict, accent) -> float:
    """The logo if there is one, then the business's name and its details."""
    y = _logo_above_name(pdf, settings, accent)
    return _details(pdf, y, settings, align="C")


def _brand_row(pdf: FPDF, settings: dict, accent) -> float:
    """The logo beside the business's name, left-aligned, details under."""
    y = MARGIN
    brand = _logo(settings)
    name_x = MARGIN
    if brand:
        logo, width, height = brand
        pdf.image(logo, x=MARGIN, y=y, w=width, h=height)
        name_x = MARGIN + width + 5
    pdf.set_xy(name_x, y + 1)
    pdf.set_font("Sans", "B", 20)
    pdf.set_text_color(*accent)
    pdf.cell(text=settings["name"], new_x="LMARGIN", new_y="NEXT")
    return _details(pdf, max(y + 12, pdf.get_y() + 1), settings, align="L")


def _logo_above_name(pdf: FPDF, settings: dict, accent) -> float:
    y = MARGIN
    brand = _logo(settings)
    if brand:
        logo, width, height = brand
        pdf.image(logo, x=(PAGE_WIDTH - width) / 2, y=y, w=width, h=height)
        y += height + 3
    pdf.set_xy(MARGIN, y)
    pdf.set_font("Sans", "B", 17)
    pdf.set_text_color(*accent)
    pdf.cell(
        w=CONTENT_WIDTH, text=settings["name"], align="C", new_x="LMARGIN", new_y="NEXT"
    )
    return pdf.get_y() + 1


def _details(pdf: FPDF, y: float, settings: dict, align: str) -> float:
    pdf.set_font("Sans", size=8.5)
    pdf.set_text_color(*MUTED)
    for line in _contact_lines(settings):
        pdf.set_xy(MARGIN, y)
        pdf.cell(w=CONTENT_WIDTH, text=line, align=align, new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y()
    return y


def _logo(
    settings: dict, max_width: float = 26, max_height: float = 14
) -> tuple[bytes, float, float] | None:
    """The logo and its box, or nothing when it cannot be read.

    A row stored before uploads were fully checked may still hold a broken
    image; the letterhead drops it instead of failing the whole PDF.
    """
    logo = settings.get("logo_data")
    if not logo:
        return None
    try:
        width, height = _logo_box(logo, max_width, max_height)
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
        return None
    return logo, width, height


def _logo_box(
    logo: bytes, max_width: float = 26, max_height: float = 14
) -> tuple[float, float]:
    """The logo scaled to fit its corner of the letterhead, keeping its shape."""
    with Image.open(BytesIO(logo)) as picture:
        picture.load()
        width, height = picture.size
    if width <= 0 or height <= 0:
        raise OSError("The logo has no size.")
    scale = min(max_width / width, max_height / height)
    return width * scale, height * scale


def _contact_lines(settings: dict) -> list[str]:
    lines = [part for part in (settings["address"] or "").splitlines() if part.strip()]
    pair = " · ".join(part for part in (settings["email"], settings["phone"]) if part)
    if pair:
        lines.append(pair)
    return lines


def _paired(pdf: FPDF, y: float, invoice: dict, meta_width: float) -> float:
    """The Bill to block on the left and the number and dates on the right."""
    bill_bottom = _bill_to(pdf, MARGIN, y, invoice)
    meta_bottom = _meta(pdf, PAGE_WIDTH - MARGIN - meta_width, y, invoice, meta_width)
    return max(bill_bottom, meta_bottom)


def _bill_to(pdf: FPDF, x: float, y: float, invoice: dict) -> float:
    """Who is billed: the organization and its address and the deal's contact."""
    pdf.set_xy(x, y)
    pdf.set_font("Sans", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(text="BILL TO", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Sans", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.set_xy(x, pdf.get_y() + 1)
    pdf.cell(text=invoice["bill_to_name"] or "", new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.set_font("Sans", size=9)
    for line in (invoice["bill_to_address"] or "").splitlines():
        if line.strip():
            pdf.set_xy(x, y)
            pdf.cell(text=line, new_x="LMARGIN", new_y="NEXT")
            y = pdf.get_y()
    for part in (invoice["bill_to_contact_name"], invoice["bill_to_contact_email"]):
        if part:
            pdf.set_xy(x, y)
            pdf.cell(text=part, new_x="LMARGIN", new_y="NEXT")
            y = pdf.get_y()
    return y


def _meta(pdf: FPDF, x: float, y: float, invoice: dict, width: float) -> float:
    """The number and the dates, the identifiers in the brand's mono."""
    for label, value in (
        ("INVOICE NUMBER", invoice["number"] or "—"),
        ("ISSUE DATE", _date(invoice["issue_date"])),
        ("DUE DATE", _date(invoice["due_date"])),
    ):
        pdf.set_xy(x, y)
        pdf.set_font("Sans", size=7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w=width, text=label, new_x="LMARGIN", new_y="NEXT")
        pdf.set_xy(x, pdf.get_y())
        pdf.set_font("Mono", "B", 11)
        pdf.set_text_color(*INK)
        pdf.cell(w=width, text=value, new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y() + 2
    return y


def _lines_table(
    pdf: FPDF, y: float, invoice: dict, accent, head_color, fill, tight: bool = False
) -> float:
    """The lines: what was sold, in what quantity, at what price."""
    pdf.set_xy(MARGIN, y)
    body = FontFace(size_pt=7.5 if tight else 9.5)
    money = FontFace(family="Mono", size_pt=7.5 if tight else 9.5)
    with pdf.table(
        col_widths=(98, 18, 32, 32),
        text_align=("LEFT", "RIGHT", "RIGHT", "RIGHT"),
        line_height=4.6 if tight else 6,
        padding=(1, 1.5, 1, 1.5),
        borders_layout="HORIZONTAL_LINES",
        headings_style=FontFace(
            emphasis="BOLD", color=head_color, size_pt=7 if tight else 8.5
        ),
        cell_fill_mode="ROWS" if fill else "NONE",
        cell_fill_color=fill,
    ) as table:
        heading = table.row()
        for cell in ("DESCRIPTION", "QTY", "UNIT PRICE", "AMOUNT"):
            heading.cell(cell)
        for line in invoice["lines"]:
            row = table.row()
            row.cell(line["description"], style=body)
            row.cell(str(line["quantity"]), style=money)
            row.cell(_usd(line["unit_price_cents"]), style=money)
            row.cell(_usd(line["quantity"] * line["unit_price_cents"]), style=money)
    return pdf.get_y()


def _totals(
    pdf: FPDF, invoice: dict, accent, bold_labels: bool, tight: bool = False
) -> None:
    """The subtotal, the tax once on it, and the total, to the cent."""
    width = 62
    x = PAGE_WIDTH - MARGIN - width
    y = pdf.get_y() + (3 if tight else 6)
    if y + 28 > PAGE_HEIGHT - MARGIN:
        pdf.add_page()
        y = MARGIN
    rows = (
        ("Subtotal", _usd(invoice["subtotal_cents"])),
        (
            f"{invoice['tax_label'] or 'Tax'} ({_rate(invoice['tax_rate_thousandths'])})",
            _usd(invoice["tax_cents"]),
        ),
    )
    for label, amount in rows:
        pdf.set_xy(x, y)
        pdf.set_font("Sans", "B" if bold_labels else "", 8.5 if tight else 9.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w=width / 2, text=label, new_x="END")
        pdf.set_font("Mono", size=8.5 if tight else 9.5)
        pdf.set_text_color(*INK)
        pdf.cell(w=width / 2, text=amount, align="R", new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y() + (1 if tight else 2)
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.5)
    pdf.line(x, y, x + width, y)
    pdf.set_xy(x, y + 1.5)
    pdf.set_font("Sans", "B", 10 if tight else 11)
    pdf.set_text_color(*accent)
    pdf.cell(w=width / 2, text="Total", new_x="END")
    pdf.set_font("Mono", "B", 10 if tight else 11)
    pdf.cell(
        w=width / 2,
        text=_usd(invoice["total_cents"]),
        align="R",
        new_x="LMARGIN",
        new_y="NEXT",
    )


def _usd(cents: int) -> str:
    return f"${cents // 100:,}.{cents % 100:02d}"


def _rate(thousandths: int | None) -> str:
    return f"{(thousandths or 0) / 1000:g}%"


def _date(value: str | date | None) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        value = date.fromisoformat(value)
    return value.strftime("%b %d, %Y").replace(" 0", " ")
