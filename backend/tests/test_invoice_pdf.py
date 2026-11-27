"""The invoice's PDF: made at download, its sums to the cent, its text and its marks."""

import base64
from datetime import date, timedelta
from io import BytesIO

import pdf_text
import pytest
from app import db, seed
from app.routes.invoices import ONLY_ISSUED_PDF
from PIL import Image
from sqlalchemy import create_engine

TODAY = date.today()
TAX_RATE = 8875  # the sample settings' rate, 8.875% in thousandths


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'pdf.db'}")
    db.metadata.create_all(test_engine)
    seed.ensure_settings(test_engine)
    yield test_engine
    test_engine.dispose()


def _organization(client, **fields):
    response = client.post("/api/organizations", json={"name": "Acme", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def _contact(client, organization_id, **fields):
    response = client.post(
        "/api/contacts",
        json={
            "name": "Pat Lee",
            "email": "pat@acme.example",
            "organization_id": organization_id,
            "status": "lead",
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _won_deal(client, value_cents=120_000):
    organization = _organization(
        client, billing_address="1 Acme Way\nNew York, NY 10001"
    )
    contact = _contact(client, organization["id"])
    deal = client.post(
        "/api/deals",
        json={
            "name": "Website build",
            "organization_id": organization["id"],
            "contact_id": contact["id"],
            "stage": "Won",
            "value_cents": value_cents,
            "probability": 100,
        },
    )
    assert deal.status_code == 201, deal.text
    return organization, contact, deal.json()


def _invoice(client, deal_id, lines=None):
    payload = (
        {"deal_id": deal_id} if lines is None else {"deal_id": deal_id, "lines": lines}
    )
    response = client.post("/api/invoices", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _issue(client, invoice_id, issue_date=TODAY):
    response = client.post(
        f"/api/invoices/{invoice_id}/issue", json={"issue_date": str(issue_date)}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _payment(client, invoice_id, amount_cents):
    response = client.post(
        f"/api/invoices/{invoice_id}/payments",
        json={
            "paid_on": str(TODAY),
            "amount_cents": amount_cents,
            "method": "bank_transfer",
            "reference": None,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _download(client, invoice_id) -> bytes:
    response = client.get(f"/api/invoices/{invoice_id}/pdf")
    assert response.status_code == 200, response.text
    return response.content


def _settings(engine, **values):
    with engine.begin() as connection:
        connection.execute(db.company_settings.update().values(**values))


def test_the_pdf_is_made_at_download_and_named_after_the_number(engine, client):
    _, _, deal = _won_deal(client)
    invoice = _issue(client, _invoice(client, deal["id"])["id"])

    response = client.get(f"/api/invoices/{invoice['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert (
        response.headers["content-disposition"] == 'attachment; filename="INV-0001.pdf"'
    )
    assert response.content.startswith(b"%PDF")

    # Made at download: the mark is the one of the moment it is drawn in.
    assert "PAID" not in pdf_text.text(response.content)
    _payment(client, invoice["id"], invoice["balance_cents"])
    assert "PAID" in pdf_text.text(_download(client, invoice["id"]))


def test_a_draft_has_no_pdf(client):
    _, _, deal = _won_deal(client)
    invoice = _invoice(client, deal["id"])

    refused = client.get(f"/api/invoices/{invoice['id']}/pdf")

    assert refused.status_code == 409
    assert refused.json()["detail"] == ONLY_ISSUED_PDF


def test_its_totals_equal_the_apps_to_the_cent_on_an_invoice_of_three_lines(client):
    _, _, deal = _won_deal(client, value_cents=120_000)
    lines = [
        {"description": "Design", "quantity": 1, "unit_price_cents": 50_000},
        {"description": "Build", "quantity": 2, "unit_price_cents": 25_000},
        {"description": "Support", "quantity": 1, "unit_price_cents": 20_000},
    ]
    invoice = _issue(client, _invoice(client, deal["id"], lines)["id"])

    app = client.get(f"/api/invoices/{invoice['id']}").json()
    assert (app["subtotal_cents"], app["tax_cents"], app["total_cents"]) == (
        120_000,
        10_650,
        130_650,
    )

    words = pdf_text.text(_download(client, invoice["id"]))

    for shown in ("$1,200.00", "$106.50", "$1,306.50"):
        assert shown in words
    assert "Sales tax (8.875%)" in words


def test_text_typed_onto_the_invoice_is_drawn_as_text_not_markup(client):
    _, _, deal = _won_deal(client, value_cents=50_000)
    typed = "<b>Design</b> & <i>build</i>"
    lines = [{"description": typed, "quantity": 1, "unit_price_cents": 50_000}]
    invoice = _issue(client, _invoice(client, deal["id"], lines)["id"])

    words = pdf_text.text(_download(client, invoice["id"]))

    assert typed in words


def test_the_paid_overdue_and_void_marks_name_their_status(client):
    _, _, first_deal = _won_deal(client, value_cents=50_000)
    paid = _issue(client, _invoice(client, first_deal["id"])["id"])
    _payment(client, paid["id"], paid["balance_cents"])

    _, _, second_deal = _won_deal(client, value_cents=50_000)
    overdue = _issue(
        client,
        _invoice(client, second_deal["id"])["id"],
        issue_date=TODAY - timedelta(days=40),
    )

    _, _, third_deal = _won_deal(client, value_cents=50_000)
    voided = _issue(client, _invoice(client, third_deal["id"])["id"])
    client.post(f"/api/invoices/{voided['id']}/void")

    assert "PAID" in pdf_text.text(_download(client, paid["id"]))
    assert "OVERDUE" in pdf_text.text(_download(client, overdue["id"]))
    assert "VOID" in pdf_text.text(_download(client, voided["id"]))


def test_each_design_draws_with_the_accent_the_logo_and_the_frozen_blocks(
    engine, client
):
    logo = client.put(
        "/api/settings/logo",
        json=_logo_payload(),
    )
    assert logo.status_code == 200, logo.text
    organization, contact, deal = _won_deal(client)
    invoice = _issue(client, _invoice(client, deal["id"])["id"])
    # The Bill to block is read at issue and never moves again.
    client.put(
        f"/api/organizations/{organization['id']}",
        json={
            "name": "Acme Two",
            "website": None,
            "industry": None,
            "notes": None,
            "billing_address": "2 Elsewhere",
        },
    )
    client.put(
        f"/api/contacts/{contact['id']}",
        json={
            "name": "Sam Reed",
            "email": "sam@acme.example",
            "organization_id": organization["id"],
            "status": "customer",
        },
    )

    for design in ("classic", "modern", "compact"):
        _settings(engine, invoice_design=design)
        data = _download(client, invoice["id"])
        assert pdf_text.draws_with(data, (7, 59, 76)), design
        assert b"/Subtype /Image" in data, design
        words = pdf_text.text(data)
        for needle in (
            "Brightloop",
            "1 Brightloop Plaza",
            "hello@brightloop.example",
            "+1 555 0100",
            "Acme",
            "1 Acme Way",
            "Pat Lee",
            "pat@acme.example",
        ):
            assert needle in words, f"{design}: {needle}"

    _settings(engine, accent_color="#123456")
    assert pdf_text.draws_with(_download(client, invoice["id"]), (18, 52, 86))


def _logo_payload() -> dict:
    buffer = BytesIO()
    Image.new("RGB", (4, 3), (200, 40, 40)).save(buffer, format="PNG")
    return {
        "content_type": "image/png",
        "data": base64.b64encode(buffer.getvalue()).decode(),
    }
