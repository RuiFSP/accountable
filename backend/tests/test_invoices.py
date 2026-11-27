"""Invoices: one bill per won deal — the draft, issuing, voiding and the list."""

from datetime import date, timedelta
from threading import Barrier, Thread

import pytest
from app import db, seed, tax
from app.main import app as local_app
from app.routes import invoices as invoices_route
from app.routes.deals import VALUE_HELD
from app.routes.invoices import (
    ALREADY_HAS,
    HAS_PAYMENTS,
    LINES_MUST_ADD_UP,
    NOT_WON,
    ONLY_DRAFT_CHANGED,
    ONLY_DRAFT_DELETED,
    ONLY_ISSUED_VOIDED,
)
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError

TODAY = date.today()
TERMS_DAYS = 30  # the sample settings' payment terms
TAX_RATE = 8875  # the sample settings' rate, 8.875% in thousandths


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'invoices.db'}")
    db.metadata.create_all(test_engine)
    seed.ensure_settings(test_engine)
    yield test_engine
    test_engine.dispose()


def _organization(client, name="Acme", **fields):
    response = client.post("/api/organizations", json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def _contact(client, organization_id, name="Pat Lee", **fields):
    response = client.post(
        "/api/contacts",
        json={
            "name": name,
            "email": "pat@acme.example",
            "organization_id": organization_id,
            "status": "lead",
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _deal(client, organization_id, contact_id, value_cents, name="Website build"):
    response = client.post(
        "/api/deals",
        json={
            "name": name,
            "organization_id": organization_id,
            "contact_id": contact_id,
            "stage": "Won",
            "value_cents": value_cents,
            "probability": 100,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _product(client, name="Design", price_cents=50_000):
    response = client.post(
        "/api/products", json={"name": name, "price_cents": price_cents}
    )
    assert response.status_code == 201, response.text
    return response.json()


def _line(product, quantity=1, unit_price_cents=None, description=None):
    return {
        "product_id": product["id"],
        "description": description or product["name"],
        "quantity": quantity,
        "unit_price_cents": product["price_cents"]
        if unit_price_cents is None
        else unit_price_cents,
    }


def _invoice(client, deal_id, lines=None):
    payload = {"deal_id": deal_id}
    if lines is not None:
        payload["lines"] = lines
    response = client.post("/api/invoices", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _issue(client, invoice_id, issue_date=TODAY):
    response = client.post(
        f"/api/invoices/{invoice_id}/issue", json={"issue_date": str(issue_date)}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _won_deal(client, value_cents=120_000):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"], value_cents)
    return organization, contact, deal


def test_creating_an_invoice_on_a_won_deal_starts_with_one_line_carrying_the_deals_value(
    client,
):
    _, _, deal = _won_deal(client, value_cents=120_000)

    invoice = _invoice(client, deal["id"])

    assert invoice["status"] == "draft"
    assert invoice["number"] is None
    assert invoice["deal_id"] == deal["id"]
    assert invoice["subtotal_cents"] == 120_000
    assert invoice["tax_label"] == "Sales tax"
    assert invoice["tax_rate_thousandths"] == TAX_RATE
    assert invoice["tax_cents"] == 10_650
    assert invoice["total_cents"] == 130_650
    assert len(invoice["lines"]) == 1
    line = invoice["lines"][0]
    assert line["description"] == deal["name"]
    assert line["quantity"] == 1
    assert line["unit_price_cents"] == 120_000
    assert line["product_id"] is None


def test_lines_that_do_not_add_up_are_refused_and_one_that_adds_up_is_saved(client):
    _, _, deal = _won_deal(client, value_cents=120_000)
    design = _product(client, "Design", 50_000)
    build = _product(client, "Build", 70_000)
    invoice = _invoice(client, deal["id"])

    refused = client.put(
        f"/api/invoices/{invoice['id']}", json={"lines": [_line(design)]}
    )

    assert refused.status_code == 400
    assert refused.json()["detail"] == LINES_MUST_ADD_UP
    unchanged = client.get(f"/api/invoices/{invoice['id']}").json()
    assert [line["description"] for line in unchanged["lines"]] == [deal["name"]]

    saved = client.put(
        f"/api/invoices/{invoice['id']}",
        json={"lines": [_line(design), _line(build)]},
    )

    assert saved.status_code == 200, saved.text
    lines = saved.json()["lines"]
    assert [(line["description"], line["unit_price_cents"]) for line in lines] == [
        ("Design", 50_000),
        ("Build", 70_000),
    ]
    assert saved.json()["subtotal_cents"] == 120_000


def test_only_a_won_deal_takes_an_invoice(client):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    response = client.post(
        "/api/deals",
        json={
            "name": "Still open",
            "organization_id": organization["id"],
            "contact_id": contact["id"],
            "stage": "Proposal",
            "value_cents": 10_000,
            "probability": 50,
        },
    )
    deal = response.json()

    refused = client.post("/api/invoices", json={"deal_id": deal["id"]})

    assert refused.status_code == 400
    assert refused.json()["detail"] == NOT_WON


def test_the_database_itself_refuses_a_second_non_void_invoice(engine, client):
    organization, _, deal = _won_deal(client)
    _invoice(client, deal["id"])

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(
                db.invoices.insert().values(
                    deal_id=deal["id"],
                    organization_id=organization["id"],
                    status="issued",
                    subtotal_cents=120_000,
                )
            )

    refused = client.post("/api/invoices", json={"deal_id": deal["id"]})
    assert refused.status_code == 409
    assert refused.json()["detail"] == ALREADY_HAS


def test_a_line_keeps_the_products_name_and_price_after_the_product_changes(client):
    _, _, deal = _won_deal(client, value_cents=50_000)
    design = _product(client, "Design", 50_000)
    invoice = _invoice(client, deal["id"], lines=[_line(design)])

    updated = client.put(
        f"/api/products/{design['id']}",
        json={"name": "Design retainer", "description": None, "price_cents": 90_000},
    )
    assert updated.status_code == 200, updated.text

    reloaded = client.get(f"/api/invoices/{invoice['id']}").json()
    line = reloaded["lines"][0]
    assert line["description"] == "Design"
    assert line["unit_price_cents"] == 50_000
    assert line["product_id"] == design["id"]


def test_a_quantity_outside_the_range_and_an_amount_over_the_limit_are_refused(client):
    _, _, deal = _won_deal(client, value_cents=50_000)
    design = _product(client, "Design", 50_000)
    invoice = _invoice(client, deal["id"])

    too_many = client.put(
        f"/api/invoices/{invoice['id']}",
        json={"lines": [_line(design, quantity=1_000_001)]},
    )
    too_big = client.put(
        f"/api/invoices/{invoice['id']}",
        json={"lines": [_line(design, unit_price_cents=tax.MAX_AMOUNT_CENTS + 1)]},
    )
    amount_over = client.put(
        f"/api/invoices/{invoice['id']}",
        json={
            "lines": [_line(design, quantity=2, unit_price_cents=tax.MAX_AMOUNT_CENTS)]
        },
    )

    for response in (too_many, too_big, amount_over):
        assert response.status_code == 400, response.text
    assert too_many.json()["detail"] == tax.QUANTITY_MESSAGE
    assert too_big.json()["detail"] == tax.AMOUNT_MESSAGE
    assert amount_over.json()["detail"] == tax.AMOUNT_MESSAGE


def test_a_draft_whose_tax_takes_the_total_over_the_money_columns_is_refused(client):
    _, _, deal = _won_deal(client, value_cents=tax.MAX_AMOUNT_CENTS)

    response = client.post("/api/invoices", json={"deal_id": deal["id"]})

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == tax.AMOUNT_MESSAGE


def test_issuing_refuses_a_total_that_grew_over_the_money_columns(engine, client):
    _, _, deal = _won_deal(client, value_cents=tax.MAX_AMOUNT_CENTS)
    with engine.begin() as connection:
        connection.execute(
            db.company_settings.update().values(
                tax_label="No tax", tax_rate_thousandths=0
            )
        )
    invoice = _invoice(client, deal["id"])

    with engine.begin() as connection:
        connection.execute(
            db.company_settings.update().values(
                tax_label="VAT", tax_rate_thousandths=100_000
            )
        )
    refused = client.post(
        f"/api/invoices/{invoice['id']}/issue",
        json={"issue_date": str(TODAY)},
    )

    assert refused.status_code == 400, refused.text
    assert refused.json()["detail"] == tax.AMOUNT_MESSAGE
    reloaded = client.get(f"/api/invoices/{invoice['id']}").json()
    assert reloaded["status"] == "draft"
    assert reloaded["number"] is None


def test_a_draft_is_edited_and_deleted_and_its_lines_go_with_it(engine, client):
    _, _, deal = _won_deal(client, value_cents=120_000)
    design = _product(client, "Design", 50_000)
    build = _product(client, "Build", 70_000)
    invoice = _invoice(client, deal["id"])
    client.put(
        f"/api/invoices/{invoice['id']}",
        json={"lines": [_line(design), _line(build)]},
    )

    deleted = client.delete(f"/api/invoices/{invoice['id']}")

    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {
        "lines": ["Design", "Build"],
        "counts": {"lines": 2},
    }
    assert client.get(f"/api/invoices/{invoice['id']}").status_code == 404
    with engine.connect() as connection:
        left = connection.execute(
            select(db.invoice_lines.c.id).where(
                db.invoice_lines.c.invoice_id == invoice["id"]
            )
        ).all()
    assert left == []


def test_issuing_takes_the_number_the_issue_date_and_the_due_date_from_the_terms(
    client,
):
    _, _, deal = _won_deal(client)
    invoice = _invoice(client, deal["id"])

    issued = _issue(client, invoice["id"], issue_date=TODAY)

    assert issued["status"] == "issued"
    assert issued["number"] == "INV-0001"
    assert issued["issue_date"] == str(TODAY)
    assert issued["due_date"] == str(TODAY + timedelta(days=TERMS_DAYS))
    assert issued["tax_label"] == "Sales tax"
    assert issued["tax_rate_thousandths"] == TAX_RATE
    assert issued["tax_cents"] == 10_650
    assert issued["total_cents"] == 130_650
    assert issued["balance_cents"] == 130_650


def test_issuing_freezes_the_tax_label_rate_and_bill_to_block(client):
    organization = _organization(
        client, name="Acme", billing_address="1 Acme Way, New York, NY 10001"
    )
    contact = _contact(client, organization["id"], name="Pat Lee")
    deal = _deal(client, organization["id"], contact["id"], 120_000)
    invoice = _invoice(client, deal["id"])
    issued = _issue(client, invoice["id"])

    changed_settings = client.put(
        "/api/settings",
        json={
            "name": "Brightloop",
            "tax_label": "VAT",
            "tax_rate_thousandths": 20_000,
            "payment_terms_days": 14,
            "quote_prefix": "QT-",
            "invoice_prefix": "INV-",
        },
    )
    assert changed_settings.status_code == 200, changed_settings.text
    client.put(
        f"/api/organizations/{organization['id']}",
        json={
            "name": "Acme Two",
            "website": None,
            "industry": None,
            "notes": None,
            "billing_address": "2 Elsewhere, New York, NY 10002",
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

    frozen = client.get(f"/api/invoices/{issued['id']}").json()

    assert frozen["tax_label"] == "Sales tax"
    assert frozen["tax_rate_thousandths"] == TAX_RATE
    assert frozen["tax_cents"] == 10_650
    assert frozen["total_cents"] == 130_650
    assert frozen["bill_to_name"] == "Acme"
    assert frozen["bill_to_address"] == "1 Acme Way, New York, NY 10001"
    assert frozen["bill_to_contact_name"] == "Pat Lee"
    assert frozen["bill_to_contact_email"] == "pat@acme.example"


def test_put_and_delete_refuse_once_issued_and_the_number_never_changes(client):
    _, _, deal = _won_deal(client)
    design = _product(client, "Design", 120_000)
    invoice = _invoice(client, deal["id"])
    issued = _issue(client, invoice["id"])

    changed = client.put(
        f"/api/invoices/{invoice['id']}", json={"lines": [_line(design)]}
    )
    deleted = client.delete(f"/api/invoices/{invoice['id']}")

    assert changed.status_code == 409
    assert changed.json()["detail"] == ONLY_DRAFT_CHANGED
    assert deleted.status_code == 409
    assert deleted.json()["detail"] == ONLY_DRAFT_DELETED
    reloaded = client.get(f"/api/invoices/{invoice['id']}").json()
    assert reloaded["number"] == issued["number"] == "INV-0001"


def test_voiding_keeps_the_number(client):
    _, _, deal = _won_deal(client)
    invoice = _invoice(client, deal["id"])
    issued = _issue(client, invoice["id"])

    voided = client.post(f"/api/invoices/{invoice['id']}/void")

    assert voided.status_code == 200, voided.text
    assert voided.json()["status"] == "void"
    assert voided.json()["number"] == issued["number"]
    assert voided.json()["balance_cents"] is None


def test_only_an_issued_invoice_can_be_voided(client):
    _, _, deal = _won_deal(client)
    invoice = _invoice(client, deal["id"])

    refused = client.post(f"/api/invoices/{invoice['id']}/void")

    assert refused.status_code == 409
    assert refused.json()["detail"] == ONLY_ISSUED_VOIDED


def test_voiding_refuses_while_payments_exist(client):
    _, _, deal = _won_deal(client)
    invoice = _invoice(client, deal["id"])
    issued = _issue(client, invoice["id"])
    recorded = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={
            "paid_on": str(TODAY),
            "amount_cents": 1_000,
            "method": "card",
            "reference": None,
        },
    )
    assert recorded.status_code == 201, recorded.text

    refused = client.post(f"/api/invoices/{invoice['id']}/void")

    assert refused.status_code == 409
    assert refused.json()["detail"] == HAS_PAYMENTS

    [payment] = recorded.json()["payments"]
    client.delete(f"/api/invoices/{invoice['id']}/payments/{payment['id']}")
    voided = client.post(f"/api/invoices/{invoice['id']}/void")
    assert voided.status_code == 200, voided.text
    assert voided.json()["status"] == "void"
    assert voided.json()["number"] == issued["number"]


def test_a_voided_invoice_does_not_stop_a_replacement(client):
    _, _, deal = _won_deal(client)
    first = _invoice(client, deal["id"])
    _issue(client, first["id"])
    client.post(f"/api/invoices/{first['id']}/void")

    second = _invoice(client, deal["id"])
    issued = _issue(client, second["id"])

    assert issued["number"] == "INV-0002"


def test_the_api_refuses_a_change_of_value_on_a_deal_with_an_invoice(client):
    _, _, deal = _won_deal(client, value_cents=120_000)
    invoice = _invoice(client, deal["id"])

    def save(value_cents):
        return client.put(
            f"/api/deals/{deal['id']}",
            json={
                "name": deal["name"],
                "organization_id": deal["organization_id"],
                "contact_id": deal["contact_id"],
                "stage": "Won",
                "value_cents": value_cents,
                "probability": 100,
                "close_date": None,
            },
        )

    refused = save(90_000)
    assert refused.status_code == 409
    assert refused.json()["detail"] == VALUE_HELD

    same_value = save(120_000)
    assert same_value.status_code == 200, same_value.text

    client.delete(f"/api/invoices/{invoice['id']}")
    assert save(90_000).status_code == 200

    replacement = _invoice(client, deal["id"])
    _issue(client, replacement["id"])
    client.post(f"/api/invoices/{replacement['id']}/void")
    assert save(75_000).status_code == 200


def test_two_issues_at_the_same_moment_take_inv_0001_and_inv_0002(
    engine, client, client_for, sign_in_as
):
    _, _, first_deal = _won_deal(client, value_cents=120_000)
    second_organization = _organization(client, name="Globex")
    second_contact = _contact(client, second_organization["id"], name="Lee Page")
    second_deal = _deal(
        client,
        second_organization["id"],
        second_contact["id"],
        50_000,
        name="App build",
    )
    first = _invoice(client, first_deal["id"])
    second = _invoice(client, second_deal["id"])
    outcomes = []
    barrier = Barrier(2)

    def issue(invoice_id):
        local_client = client_for(local_app, sign_in_as())
        barrier.wait()
        response = local_client.post(
            f"/api/invoices/{invoice_id}/issue", json={"issue_date": str(TODAY)}
        )
        outcomes.append((response.status_code, response.json().get("number")))

    threads = [
        Thread(target=issue, args=(first["id"],)),
        Thread(target=issue, args=(second["id"],)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcomes) == [(200, "INV-0001"), (200, "INV-0002")]


def test_issuing_the_same_draft_twice_takes_one_number(
    engine, client, client_for, sign_in_as, monkeypatch
):
    _, _, deal = _won_deal(client, value_cents=120_000)
    invoice = _invoice(client, deal["id"])
    barrier = Barrier(2)
    original = invoices_route._locked_invoice

    def start_together(connection, invoice_id):
        barrier.wait()
        return original(connection, invoice_id)

    monkeypatch.setattr(invoices_route, "_locked_invoice", start_together)
    outcomes = []

    def issue():
        local_client = client_for(local_app, sign_in_as())
        response = local_client.post(
            f"/api/invoices/{invoice['id']}/issue",
            json={"issue_date": str(TODAY)},
        )
        outcomes.append((response.status_code, response.json()))

    threads = [Thread(target=issue) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(code for code, _ in outcomes) == [200, 409]
    [winner] = [body for code, body in outcomes if code == 200]
    [refused] = [body for code, body in outcomes if code == 409]
    assert refused["detail"] == ONLY_DRAFT_CHANGED
    with engine.connect() as connection:
        stored = (
            connection.execute(
                select(db.invoices).where(db.invoices.c.id == invoice["id"])
            )
            .mappings()
            .one()
        )
        counter = connection.execute(
            select(db.number_counters.c.last_number)
        ).scalar_one()
    assert stored["status"] == "issued"
    assert stored["number"] == winner["number"]
    assert counter == 1


def test_deleting_a_draft_racing_an_issue_cannot_delete_an_issued_invoice(
    client, client_for, sign_in_as, monkeypatch
):
    _, _, deal = _won_deal(client, value_cents=120_000)
    invoice = _invoice(client, deal["id"])
    barrier = Barrier(2)
    original = invoices_route._locked_invoice

    def start_together(connection, invoice_id):
        barrier.wait()
        return original(connection, invoice_id)

    monkeypatch.setattr(invoices_route, "_locked_invoice", start_together)
    outcomes = {}

    def delete():
        local_client = client_for(local_app, sign_in_as())
        outcomes["delete"] = local_client.delete(f"/api/invoices/{invoice['id']}")

    def issue():
        local_client = client_for(local_app, sign_in_as())
        outcomes["issue"] = local_client.post(
            f"/api/invoices/{invoice['id']}/issue",
            json={"issue_date": str(TODAY)},
        )

    threads = [Thread(target=delete), Thread(target=issue)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    if outcomes["delete"].status_code == 200:
        assert outcomes["issue"].status_code in (404, 409)
        assert client.get(f"/api/invoices/{invoice['id']}").status_code == 404
    else:
        assert outcomes["delete"].status_code == 409
        assert outcomes["issue"].status_code == 200, outcomes["issue"].text
        stored = client.get(f"/api/invoices/{invoice['id']}").json()
        assert stored["status"] == "issued"


def test_the_list_searches_filters_and_hides_number_and_balance(client):
    acme = _organization(client, name="Acme")
    acme_contact = _contact(client, acme["id"])
    website = _deal(
        client, acme["id"], acme_contact["id"], 120_000, name="Website build"
    )
    globex = _organization(client, name="Globex")
    globex_contact = _contact(client, globex["id"], name="Lee Page")
    app_deal = _deal(
        client, globex["id"], globex_contact["id"], 50_000, name="App build"
    )
    third = _organization(client, name="Initech")
    third_contact = _contact(client, third["id"], name="Ann Voss")
    support = _deal(client, third["id"], third_contact["id"], 20_000, name="Support")

    draft = _invoice(client, website["id"])
    issued = _issue(client, _invoice(client, app_deal["id"])["id"])
    voided = _issue(client, _invoice(client, support["id"])["id"])
    client.post(f"/api/invoices/{voided['id']}/void")

    rows = client.get("/api/invoices").json()

    assert [row["id"] for row in rows] == [draft["id"], issued["id"], voided["id"]]
    by_id = {row["id"]: row for row in rows}
    assert by_id[draft["id"]]["number"] is None
    assert by_id[draft["id"]]["balance_cents"] is None
    assert by_id[issued["id"]]["number"] == "INV-0001"
    assert by_id[issued["id"]]["balance_cents"] == issued["total_cents"]
    assert by_id[voided["id"]]["number"] == "INV-0002"
    assert by_id[voided["id"]]["balance_cents"] is None

    assert [
        row["id"] for row in client.get("/api/invoices", params={"q": "Website"}).json()
    ] == [draft["id"]]
    assert [
        row["id"] for row in client.get("/api/invoices", params={"q": "Globex"}).json()
    ] == [issued["id"]]
    assert [
        row["id"]
        for row in client.get("/api/invoices", params={"q": "INV-0002"}).json()
    ] == [voided["id"]]
    assert [
        row["id"]
        for row in client.get("/api/invoices", params={"status": "draft"}).json()
    ] == [draft["id"]]
    assert [
        row["id"]
        for row in client.get("/api/invoices", params={"status": "void"}).json()
    ] == [voided["id"]]
    assert [
        row["id"]
        for row in client.get("/api/invoices", params={"status": "issued"}).json()
    ] == [issued["id"]]


def test_the_deal_and_organization_views_list_every_invoice_void_ones_included(client):
    acme = _organization(client, name="Acme")
    acme_contact = _contact(client, acme["id"])
    website = _deal(
        client, acme["id"], acme_contact["id"], 120_000, name="Website build"
    )
    app_deal = _deal(client, acme["id"], acme_contact["id"], 50_000, name="App build")

    first = _invoice(client, website["id"])
    _issue(client, first["id"])
    client.post(f"/api/invoices/{first['id']}/void")
    second = _invoice(client, website["id"])
    _issue(client, second["id"])
    third = _invoice(client, app_deal["id"])

    on_deal = client.get("/api/invoices", params={"deal_id": website["id"]}).json()
    on_organization = client.get(
        "/api/invoices", params={"organization_id": acme["id"]}
    ).json()

    assert [row["id"] for row in on_deal] == [first["id"], second["id"]]
    assert {row["status"] for row in on_deal} == {"void", "issued"}
    assert [row["id"] for row in on_organization] == [
        first["id"],
        second["id"],
        third["id"],
    ]
