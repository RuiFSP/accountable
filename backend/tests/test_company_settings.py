from datetime import UTC, datetime

import pytest
from app import db, seed
from app.routes.company_settings import (
    EMAIL_INVALID,
    NAME_REQUIRED,
    PAYMENT_TERMS_RANGE,
    PREFIX_INVALID,
    TAX_RATE_RANGE,
)
from sqlalchemy import create_engine, func, select


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
