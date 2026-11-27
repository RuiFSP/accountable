import base64
import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest
from app import db, documents, seed
from app.routes.company_settings import (
    ACCENT_CONTRAST,
    ACCENT_INVALID,
    DESIGN_INVALID,
    EMAIL_INVALID,
    NAME_REQUIRED,
    PAYMENT_TERMS_RANGE,
    PREFIX_INVALID,
    TAX_RATE_RANGE,
)
from PIL import Image
from sqlalchemy import create_engine, func, select

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "invoice-cases.json").read_text()
)


@pytest.fixture()
def settings_db(tmp_path, monkeypatch):
    """A fresh seeded database per test: every save changes the one row."""
    test_engine = create_engine(f"sqlite:///{tmp_path / 'settings.db'}")
    seed.ensure_seeded(test_engine)
    monkeypatch.setattr(db, "get_engine", lambda: test_engine)
    yield test_engine
    test_engine.dispose()


def _client(settings_db, client_for, sign_in_as, email=None):
    from app.main import app

    return client_for(app, sign_in_as(email))


@pytest.fixture()
def settings_client(settings_db, client_for, sign_in_as):
    return _client(settings_db, client_for, sign_in_as)


def payload(**overrides) -> dict:
    values = {
        "name": "Brightloop",
        "address": "1 Brightloop Plaza, Floor 12, New York, NY 10004",
        "email": "hello@brightloop.example",
        "phone": "+1 555 0100",
        "tax_label": "Sales tax",
        "tax_rate_thousandths": 8875,
        "payment_terms_days": 30,
        "quote_prefix": "QT-",
        "invoice_prefix": "INV-",
        "invoice_design": "classic",
        "accent_color": "#073B4C",
    }
    values.update(overrides)
    return values


def test_get_returns_the_one_row_and_its_fields(settings_client):
    response = settings_client.get("/api/settings")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "id",
        "name",
        "address",
        "email",
        "phone",
        "tax_label",
        "tax_rate_thousandths",
        "payment_terms_days",
        "quote_prefix",
        "invoice_prefix",
        "updated_by",
        "updated_at",
        "invoice_design",
        "accent_color",
        "logo_content_type",
    }
    assert body["id"] == 1
    assert body["name"] == "Brightloop"
    assert body["address"] == "1 Brightloop Plaza, Floor 12, New York, NY 10004"
    assert body["email"] == "hello@brightloop.example"
    assert body["phone"] == "+1 555 0100"
    assert body["tax_label"] == "Sales tax"
    assert body["tax_rate_thousandths"] == 8875
    assert body["payment_terms_days"] == 30
    assert body["quote_prefix"] == "QT-"
    assert body["invoice_prefix"] == "INV-"
    assert body["invoice_design"] == "classic"
    assert body["accent_color"] == "#073B4C"
    # Brightloop comes with its logo (company-settings decision 18).
    assert body["logo_content_type"] == "image/png"
    assert body["updated_by"] == "priya@brightloop.example"
    moment = datetime.fromisoformat(body["updated_at"])
    assert moment.utcoffset() is not None


def test_put_saves_trimmed_values_and_returns_them(settings_client):
    response = settings_client.put(
        "/api/settings",
        json=payload(
            name="  Brightloop Studio  ",
            address="  9 Market Street  ",
            email="  hello@brightloop.example ",
            phone=" +1 555 0199 ",
            tax_label="  VAT ",
            tax_rate_thousandths=0,
            payment_terms_days=365,
            quote_prefix=" QT-2 ",
            invoice_prefix=" INV-2 ",
        ),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Brightloop Studio"
    assert body["address"] == "9 Market Street"
    assert body["email"] == "hello@brightloop.example"
    assert body["phone"] == "+1 555 0199"
    assert body["tax_label"] == "VAT"
    assert body["tax_rate_thousandths"] == 0
    assert body["payment_terms_days"] == 365
    assert body["quote_prefix"] == "QT-2"
    assert body["invoice_prefix"] == "INV-2"


def test_put_turns_blank_optional_text_into_null(settings_client):
    response = settings_client.put(
        "/api/settings",
        json=payload(
            address="   ",
            email="",
            phone=" ",
            tax_label="",
            quote_prefix="",
            invoice_prefix="   ",
        ),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    for field in (
        "address",
        "email",
        "phone",
        "tax_label",
        "quote_prefix",
        "invoice_prefix",
    ):
        assert body[field] is None, field


def test_a_save_by_priya_credits_her_and_moves_the_moment(
    settings_db, client_for, sign_in_as
):
    priya = _client(settings_db, client_for, sign_in_as, "priya@brightloop.example")
    before = priya.get("/api/settings").json()

    response = priya.put("/api/settings", json=payload(name="Brightloop Studio"))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Brightloop Studio"
    assert body["updated_by"] == "priya@brightloop.example"
    assert datetime.fromisoformat(body["updated_at"]) > datetime.fromisoformat(
        before["updated_at"]
    )


def test_a_save_that_changes_nothing_leaves_who_and_when(
    settings_db, client_for, sign_in_as
):
    priya = _client(settings_db, client_for, sign_in_as, "priya@brightloop.example")
    alex = _client(settings_db, client_for, sign_in_as)
    first = priya.put("/api/settings", json=payload(name="Brightloop Studio")).json()

    response = alex.put("/api/settings", json=payload(name="Brightloop Studio"))

    body = response.json()
    assert body["updated_by"] == first["updated_by"]
    assert body["updated_at"] == first["updated_at"]


def test_a_body_naming_a_person_is_ignored(settings_client):
    response = settings_client.put(
        "/api/settings",
        json=payload(
            name="Brightloop Studio",
            updated_by="someone@else.example",
            updated_at="2000-01-01T00:00:00+00:00",
        ),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated_by"] == "alex@brightloop.example"
    assert datetime.fromisoformat(body["updated_at"]) > datetime(2020, 1, 1, tzinfo=UTC)


def test_boundaries_are_accepted(settings_client):
    response = settings_client.put(
        "/api/settings",
        json=payload(
            tax_rate_thousandths=100_000,
            payment_terms_days=365,
            quote_prefix="ABCDEFGHIJ",
            invoice_prefix="0123456789",
        ),
    )

    assert response.status_code == 200, response.text
    assert response.json()["tax_rate_thousandths"] == 100_000
    assert response.json()["quote_prefix"] == "ABCDEFGHIJ"


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"name": "   "}, NAME_REQUIRED),
        ({"email": "not-an-email"}, EMAIL_INVALID),
        ({"email": "two@@brightloop.example"}, EMAIL_INVALID),
        ({"email": "no-dot@brightloop"}, EMAIL_INVALID),
        ({"tax_rate_thousandths": -1}, TAX_RATE_RANGE),
        ({"tax_rate_thousandths": 100_001}, TAX_RATE_RANGE),
        ({"tax_rate_thousandths": 150_000}, TAX_RATE_RANGE),
        ({"payment_terms_days": -1}, PAYMENT_TERMS_RANGE),
        ({"payment_terms_days": 366}, PAYMENT_TERMS_RANGE),
        ({"payment_terms_days": 400}, PAYMENT_TERMS_RANGE),
        ({"quote_prefix": "ABCDEFGHIJK"}, PREFIX_INVALID),
        ({"invoice_prefix": "INV 1"}, PREFIX_INVALID),
        ({"quote_prefix": "QT_1"}, PREFIX_INVALID),
    ],
)
def test_a_bad_value_is_refused_with_a_plain_message(
    settings_client, overrides, message
):
    response = settings_client.put("/api/settings", json=payload(**overrides))

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == message
    # Nothing invalid was stored.
    stored = settings_client.get("/api/settings").json()
    assert stored["name"] == "Brightloop"
    assert stored["tax_rate_thousandths"] == 8875
    assert stored["payment_terms_days"] == 30
    assert stored["quote_prefix"] == "QT-"


def test_the_table_still_holds_one_row(settings_db, settings_client):
    settings_client.put("/api/settings", json=payload(name="One"))
    settings_client.put("/api/settings", json=payload(name="Two"))

    with settings_db.connect() as connection:
        count = connection.execute(
            select(func.count()).select_from(db.company_settings)
        ).scalar_one()
    assert count == 1


def test_the_documents_fields_save_with_the_rest_and_move_the_last_change_line_only_when_a_value_differs(
    settings_client,
):
    before = settings_client.get("/api/settings").json()

    saved = settings_client.put(
        "/api/settings",
        json=payload(invoice_design="modern", accent_color="#123456"),
    )
    again = settings_client.put(
        "/api/settings",
        json=payload(invoice_design="modern", accent_color="#123456"),
    )

    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert (body["invoice_design"], body["accent_color"]) == ("modern", "#123456")
    assert body["updated_at"] != before["updated_at"]
    assert again.status_code == 200, again.text
    assert again.json()["updated_at"] == body["updated_at"]
    assert again.json()["invoice_design"] == "modern"


def test_an_accent_below_4_5_to_1_against_white_is_refused_with_a_clear_message(
    settings_client,
):
    too_light = settings_client.put(
        "/api/settings", json=payload(accent_color="#06D6A0")
    )
    malformed = settings_client.put("/api/settings", json=payload(accent_color="#XYZ"))
    wrong_design = settings_client.put(
        "/api/settings", json=payload(invoice_design="fancy")
    )

    assert too_light.status_code == 400
    assert too_light.json()["detail"] == ACCENT_CONTRAST
    assert malformed.status_code == 400
    assert malformed.json()["detail"] == ACCENT_INVALID
    assert wrong_design.status_code == 400
    assert wrong_design.json()["detail"] == DESIGN_INVALID
    stored = settings_client.get("/api/settings").json()
    assert (stored["invoice_design"], stored["accent_color"]) == ("classic", "#073B4C")


def test_the_shared_accent_cases_read_the_same_on_the_backend():
    for case in CASES["accents"]:
        assert documents.accent_is_readable(case["color"]) == case["accepted"], case[
            "why"
        ]


def test_the_logo_uploads_serves_and_removes(settings_client):
    buffer = BytesIO()
    Image.new("RGB", (4, 3), (200, 40, 40)).save(buffer, format="PNG")
    logo = buffer.getvalue()

    saved = settings_client.put(
        "/api/settings/logo",
        json={
            "content_type": "image/png",
            "data": base64.b64encode(logo).decode(),
        },
    )
    served = settings_client.get("/api/settings/logo")
    removed = settings_client.delete("/api/settings/logo")

    assert saved.status_code == 200, saved.text
    assert saved.json()["logo_content_type"] == "image/png"
    assert served.content == logo
    assert removed.status_code == 200
    assert removed.json()["logo_content_type"] is None
    assert settings_client.get("/api/settings/logo").status_code == 404
