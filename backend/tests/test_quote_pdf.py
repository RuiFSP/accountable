"""The quote document: its rows, the typed text through them, and the PDF."""

import re
import zlib
from datetime import date, timedelta

import pytest
from app import db, quote_pdf, seed
from sqlalchemy import create_engine, select


@pytest.fixture()
def client(tmp_path, monkeypatch, client_for, sign_in_as):
    """The app on an empty database of its own, holding only the settings row."""
    engine = create_engine(f"sqlite:///{tmp_path / 'quote-pdf.db'}")
    seed.create_tables(engine)
    seed.ensure_settings(engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    from app.main import app

    return client_for(app, sign_in_as())


@pytest.fixture()
def quote(client):
    """A sent quote on a deal with a main contact, built from three products."""
    organization = client.post(
        "/api/organizations",
        json={
            "name": "Northwind Traders",
            "website": None,
            "industry": None,
            "notes": None,
        },
    ).json()
    contact = client.post(
        "/api/contacts",
        json={
            "name": "Ana Silva",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": organization["id"],
            "status": "customer",
        },
    ).json()
    deal = client.post(
        "/api/deals",
        json={
            "name": "Store rollout",
            "organization_id": organization["id"],
            "contact_id": contact["id"],
            "stage": "Proposal",
            "value_cents": 100_000,
            "probability": 50,
            "close_date": None,
        },
    ).json()
    products = {}
    for name, price in (
        ("Data migration", 180_000),
        ("Annual support plan", 240_000),
        ("Onsite training day", 120_000),
    ):
        products[name] = client.post(
            "/api/products",
            json={"name": name, "description": None, "price_cents": price},
        ).json()
    created = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "valid_until": None,
            "lines": [
                {
                    "product_id": products["Data migration"]["id"],
                    "description": "**bold** <b>x</b> under_scores",
                    "quantity": 2,
                    "unit_price_cents": 180_000,
                },
                {
                    "product_id": products["Annual support plan"]["id"],
                    "description": "w" * 120,
                    "quantity": 1,
                    "unit_price_cents": 240_000,
                },
                {
                    "product_id": products["Onsite training day"]["id"],
                    "description": None,
                    "quantity": 5,
                    "unit_price_cents": 120_000,
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    assert client.post(f"/api/quotes/{created.json()['id']}/send").status_code == 200
    return created.json()


def _document(client, quote_id: int) -> dict:
    with db.get_engine().connect() as connection:
        quote = dict(
            connection.execute(select(db.quotes).where(db.quotes.c.id == quote_id))
            .mappings()
            .one()
        )
        lines = [
            dict(row)
            for row in connection.execute(
                select(db.quote_lines)
                .where(db.quote_lines.c.quote_id == quote_id)
                .order_by(db.quote_lines.c.position)
            ).mappings()
        ]
        return quote_pdf.quote_document(connection, quote, lines)


def test_the_document_reads_the_settings_the_deal_and_the_lines(client, quote):
    document = _document(client, quote["id"])

    assert document["company"] == {
        "name": "Brightloop",
        "address": "1 Brightloop Plaza, Floor 12, New York, NY 10004",
        "email": "hello@brightloop.example",
        "phone": "+1 555 0100",
    }
    assert document["customer"] == {
        "organization": "Northwind Traders",
        "contact": "Ana Silva",
    }
    assert document["number"] == "QT-0001"
    assert document["created_at"] == date.today()
    assert document["valid_until"] == date.today() + timedelta(days=30)
    assert document["tax_label"] == "Sales tax"
    assert document["tax_rate_thousandths"] == 8875

    assert [
        (
            line["product_name"],
            line["quantity"],
            line["unit_price_cents"],
            line["amount_cents"],
        )
        for line in document["lines"]
    ] == [
        ("Data migration", 2, 180_000, 360_000),
        ("Annual support plan", 1, 240_000, 240_000),
        ("Onsite training day", 5, 120_000, 600_000),
    ]
    assert document["subtotal_cents"] == 1_200_000
    assert document["tax_cents"] == 106_500
    assert document["total_cents"] == 1_306_500


def test_typed_text_passes_through_the_model_as_plain_text(client, quote):
    document = _document(client, quote["id"])

    typed = document["lines"][0]["description"]
    assert typed == "**bold** <b>x</b> under_scores"
    unbroken = document["lines"][1]["description"]
    assert unbroken == "w" * 120


def test_the_rendered_pdf_carries_the_page_count_and_the_brand_fonts(client, quote):
    document = _document(client, quote["id"])

    data = quote_pdf.render_pdf(document)

    assert data.startswith(b"%PDF-")
    assert data.count(b"/Type /Page") - data.count(b"/Type /Pages") == 1
    for family in (b"InstrumentSans", b"InstrumentSerif", b"JetBrainsMono"):
        assert family in data


def _drawn_positions(data: bytes) -> list[list[tuple[float, float]]]:
    """The spot every piece of text is drawn at, page by page.

    A page's content stream writes each text item as ``BT x y Td``, so two
    items on one page at the same spot are printed on top of each other.
    """
    pages = []
    for match in re.finditer(rb"(?<!end)stream\r?\n", data):
        start = match.end()
        try:
            stream = zlib.decompress(data[start : data.find(b"endstream", start)])
        except zlib.error:
            continue
        if b"BT" in stream:
            pages.append(
                [
                    (float(x), float(y))
                    for x, y in re.findall(rb"BT ([\d.-]+) ([\d.-]+) Td", stream)
                ]
            )
    return pages


def test_a_long_quote_flows_over_a_few_pages(client, quote):
    """A page per screenful, not a page per row: 120 rows share the pages."""
    document = _document(client, quote["id"])
    document["lines"] = document["lines"] * 40

    pages = _drawn_positions(quote_pdf.render_pdf(document))

    assert 2 <= len(pages) <= 12
    assert all(len(page) == len(set(page)) for page in pages)


def test_a_wrapping_address_is_not_printed_over_what_follows_it(client, quote):
    """The company's address is free text: it wraps, and what follows waits."""
    document = _document(client, quote["id"])
    short = _drawn_positions(quote_pdf.render_pdf(document))

    document["company"]["address"] = "1 Brightloop Plaza, " * 100
    pages = _drawn_positions(quote_pdf.render_pdf(document))

    assert sum(map(len, pages)) > sum(map(len, short)) + 5
    assert all(len(page) == len(set(page)) for page in pages)


def test_money_always_shows_its_currency_and_two_decimals():
    assert quote_pdf.money(1_306_500) == "$13,065.00"
    assert quote_pdf.money(5) == "$0.05"
    assert quote_pdf.money(0) == "$0.00"
    assert quote_pdf.percent(8875) == "8.875%"
    assert quote_pdf.percent(100) == "0.1%"
    assert quote_pdf.percent(0) == "0%"
    assert quote_pdf.date_label(date(2026, 11, 5)) == "Nov 5, 2026"


def test_the_pdf_route_downloads_a_sent_quote_named_for_its_number(client, quote):
    response = client.get(f"/api/quotes/{quote['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert (
        response.headers["content-disposition"] == 'attachment; filename="QT-0001.pdf"'
    )
    assert response.content.startswith(b"%PDF-")


def test_the_pdf_route_refuses_a_draft(client):
    organization = client.post(
        "/api/organizations",
        json={
            "name": "Draft PDF Corp",
            "website": None,
            "industry": None,
            "notes": None,
        },
    ).json()
    deal = client.post(
        "/api/deals",
        json={
            "name": "Draft PDF deal",
            "organization_id": organization["id"],
            "contact_id": None,
            "stage": "Proposal",
            "value_cents": 100_000,
            "probability": 50,
            "close_date": None,
        },
    ).json()
    product = client.post(
        "/api/products",
        json={"name": "Draft PDF product", "description": None, "price_cents": 10_000},
    ).json()
    draft = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "valid_until": None,
            "lines": [
                {
                    "product_id": product["id"],
                    "description": None,
                    "quantity": 1,
                    "unit_price_cents": 10_000,
                }
            ],
        },
    ).json()

    response = client.get(f"/api/quotes/{draft['id']}/pdf")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "A draft has no PDF; it is downloaded once the quote is sent."
    }
