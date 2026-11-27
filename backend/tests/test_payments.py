"""Payments: recording money against an issued invoice, and the balance it leaves."""

import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from app import db, invoice_state, seed
from app.main import app as local_app
from app.routes.invoices import (
    ONLY_ISSUED_TAKES_PAYMENTS,
    PAYMENT_AMOUNT,
    PAYMENT_DATE,
)
from sqlalchemy import create_engine

TODAY = date.today()
TERMS_DAYS = 30  # the sample settings' payment terms

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "invoice-cases.json").read_text()
)

METHODS = ["bank_transfer", "card", "check", "cash", "other"]


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'payments.db'}")
    db.metadata.create_all(test_engine)
    seed.ensure_settings(test_engine)
    yield test_engine
    test_engine.dispose()


def _organization(client, name="Acme"):
    response = client.post("/api/organizations", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def _deal(client, organization_id, value_cents=120_000):
    response = client.post(
        "/api/deals",
        json={
            "name": "Website build",
            "organization_id": organization_id,
            "contact_id": None,
            "stage": "Won",
            "value_cents": value_cents,
            "probability": 100,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _issued(client, value_cents=120_000, issue_date=TODAY):
    organization = _organization(client)
    deal = _deal(client, organization["id"], value_cents)
    invoice = client.post("/api/invoices", json={"deal_id": deal["id"]}).json()
    issued = client.post(
        f"/api/invoices/{invoice['id']}/issue",
        json={"issue_date": str(issue_date)},
    )
    assert issued.status_code == 200, issued.text
    return issued.json()


def _payment(client, invoice_id, amount_cents, **fields):
    payload = {
        "paid_on": str(TODAY),
        "amount_cents": amount_cents,
        "method": "bank_transfer",
        "reference": None,
    }
    payload.update(fields)
    return client.post(f"/api/invoices/{invoice_id}/payments", json=payload)


def test_a_payment_is_more_than_zero_and_no_more_than_what_is_still_owed(client):
    invoice = _issued(client)
    owed = invoice["balance_cents"]
    assert owed == 130_650

    nothing = _payment(client, invoice["id"], 0)
    negative = _payment(client, invoice["id"], -100)
    too_much = _payment(client, invoice["id"], owed + 1)
    exact = _payment(client, invoice["id"], owed)

    for response in (nothing, negative, too_much):
        assert response.status_code == 400, response.text
        assert response.json()["detail"] == PAYMENT_AMOUNT
    assert exact.status_code == 201, exact.text
    assert exact.json()["balance_cents"] == 0
    assert exact.json()["status"] == "paid"


def test_a_payment_is_dated_when_it_arrived_and_never_in_the_future(client):
    invoice = _issued(client)

    future = _payment(
        client, invoice["id"], 1_000, paid_on=str(TODAY + timedelta(days=1))
    )
    arrived = _payment(
        client, invoice["id"], 1_000, paid_on=str(TODAY - timedelta(days=2))
    )

    assert future.status_code == 400
    assert future.json()["detail"] == PAYMENT_DATE
    assert arrived.status_code == 201, arrived.text
    assert arrived.json()["payments"][0]["paid_on"] == str(TODAY - timedelta(days=2))


def test_its_method_is_one_of_the_five_and_its_reference_is_optional(client):
    invoice = _issued(client)

    for method in METHODS:
        recorded = _payment(client, invoice["id"], 1_000, method=method)
        assert recorded.status_code == 201, recorded.text
    refused = _payment(client, invoice["id"], 1_000, method="cheque")
    with_reference = _payment(client, invoice["id"], 1_000, reference="  Wire 42  ")
    without_reference = _payment(client, invoice["id"], 1_000)

    assert refused.status_code == 422
    payments = with_reference.json()["payments"]
    assert payments[-1]["reference"] == "Wire 42"
    assert without_reference.json()["payments"][-1]["reference"] is None


def test_a_draft_or_a_void_invoice_takes_no_payments(client):
    organization = _organization(client)
    deal = _deal(client, organization["id"])
    draft = client.post("/api/invoices", json={"deal_id": deal["id"]}).json()

    on_draft = _payment(client, draft["id"], 1_000)

    assert on_draft.status_code == 409
    assert on_draft.json()["detail"] == ONLY_ISSUED_TAKES_PAYMENTS

    client.post(f"/api/invoices/{draft['id']}/issue", json={"issue_date": str(TODAY)})
    client.post(f"/api/invoices/{draft['id']}/void")

    on_void = _payment(client, draft["id"], 1_000)

    assert on_void.status_code == 409
    assert on_void.json()["detail"] == ONLY_ISSUED_TAKES_PAYMENTS


def test_payments_bring_the_balance_down_and_the_invoice_reads_part_paid_then_paid(
    client,
):
    invoice = _issued(client)

    part = _payment(client, invoice["id"], 50_000)

    assert part.json()["paid_cents"] == 50_000
    assert part.json()["balance_cents"] == 80_650
    assert part.json()["status"] == "part paid"

    rest = _payment(client, invoice["id"], 80_650)

    assert rest.json()["paid_cents"] == 130_650
    assert rest.json()["balance_cents"] == 0
    assert rest.json()["status"] == "paid"


def test_an_invoice_owed_after_its_due_date_reads_overdue_and_one_due_today_does_not(
    client,
):
    past = _issued(client, issue_date=TODAY - timedelta(days=TERMS_DAYS + 10))
    due_today = _issued(
        client, value_cents=50_000, issue_date=TODAY - timedelta(days=TERMS_DAYS)
    )

    assert past["due_date"] == str(TODAY - timedelta(days=10))
    assert past["status"] == "overdue"
    assert due_today["due_date"] == str(TODAY)
    assert due_today["status"] == "issued"


def test_deleting_a_payment_puts_the_balance_back_up_and_records_who_entered_the_one_that_remains(
    engine, client, client_for, sign_in_as
):
    invoice = _issued(client)
    first = _payment(client, invoice["id"], 50_000).json()
    other_client = client_for(local_app, sign_in_as("priya@brightloop.example"))
    second = _payment(other_client, invoice["id"], 10_000).json()
    deleted_payment_id = second["payments"][-1]["id"]

    deleted = client.delete(
        f"/api/invoices/{invoice['id']}/payments/{deleted_payment_id}"
    )

    assert deleted.status_code == 200, deleted.text
    body = deleted.json()
    assert body["paid_cents"] == 50_000
    assert body["balance_cents"] == 80_650
    assert body["status"] == "part paid"
    [remaining] = body["payments"]
    assert remaining["id"] == first["payments"][0]["id"]
    assert remaining["created_by"] == "alex@brightloop.example"


def test_the_shared_status_cases_read_the_same_on_the_backend():
    for case in CASES["statuses"]:
        due = None
        if case["due_in_days"] is not None:
            due = TODAY + timedelta(days=case["due_in_days"])
        shown = invoice_state.display_status(
            case["stored"],
            case["total_cents"],
            case["paid_cents"],
            due,
            TODAY,
        )
        assert shown == case["status"], case["why"]


def test_the_shared_aging_cases_read_the_same_on_the_backend():
    for case in CASES["aging"]:
        due = TODAY + timedelta(days=case["due_in_days"])
        assert invoice_state.aging_bucket(due, TODAY) == case["bucket"], case["why"]
