from app import db, holds


def _organization(client) -> int:
    return client.get("/api/organizations").json()[0]["id"]


def _create_deal(client, organization_id: int, name: str) -> int:
    response = client.post(
        "/api/deals",
        json={
            "name": name,
            "organization_id": organization_id,
            "contact_id": None,
            "stage": "New",
            "value_cents": 100_000,
            "probability": 10,
            "close_date": None,
            "position": None,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_activity(client, deal_id: int, description: str) -> None:
    response = client.post(
        "/api/activities",
        json={
            "type": "note",
            "contact_id": None,
            "deal_id": deal_id,
            "description": description,
            "happened_at": "2026-11-25T09:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert response.status_code == 201, response.text


def test_a_deal_held_by_another_area_refuses_to_be_deleted(client, monkeypatch):
    organization_id = _organization(client)
    deal_id = _create_deal(client, organization_id, "Held deal")
    _create_activity(client, deal_id, "A note that holds this deal")
    # The stand-in goes through the accessor tests can replace. Patching
    # app.state.holds would not undo cleanly: monkeypatch's undo deletes the
    # attribute instead of restoring it, and later tests would lose the bill's
    # real hold.
    monkeypatch.setattr(
        holds,
        "app_holds",
        lambda _app: (holds.Hold(db.activities.c.deal_id, "activity"),),
    )

    response = client.delete(f"/api/deals/{deal_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This deal has 1 activity, so it can't be deleted."
    }


def test_an_organization_checks_the_deals_it_would_take_too(client, monkeypatch):
    organization = client.post(
        "/api/organizations",
        json={
            "name": "Held supplier",
            "website": None,
            "industry": None,
            "notes": None,
        },
    )
    assert organization.status_code == 201, organization.text
    organization_id = organization.json()["id"]
    deal_id = _create_deal(client, organization_id, "Held deal in the organization")
    _create_activity(client, deal_id, "A note that holds the deal")
    monkeypatch.setattr(
        holds,
        "app_holds",
        lambda _app: (holds.Hold(db.activities.c.deal_id, "activity"),),
    )

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 1 activity, so it can't be deleted."
    }


def test_a_record_with_nothing_holding_it_is_still_deleted(client):
    organization_id = _organization(client)
    deal_id = _create_deal(client, organization_id, "Free deal")
    _create_activity(client, deal_id, "A note that goes with the deal")

    response = client.delete(f"/api/deals/{deal_id}")

    assert response.status_code == 200
    assert response.json()["counts"] == {"activities": 1}


def _create_bill(client, organization_id: int, bill_number: str) -> int:
    response = client.post(
        "/api/bills",
        json={
            "organization_id": organization_id,
            "bill_number": bill_number,
            "bill_date": "2026-11-01",
            "due_date": None,
            "category": "Office",
            "amount_cents": 100_000,
            "tax_cents": 8_000,
            "notes": None,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _supplier(client, name: str) -> int:
    response = client.post(
        "/api/organizations",
        json={"name": name, "website": None, "industry": None, "notes": None},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_a_real_bill_holds_its_supplier_organization(client):
    organization_id = _supplier(client, "Billed supplier")
    _create_bill(client, organization_id, "HELD-001")
    _create_bill(client, organization_id, "HELD-002")

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 2 bills, so it can't be deleted."
    }


def test_one_bill_is_named_in_the_singular(client):
    organization_id = _supplier(client, "One-bill supplier")
    _create_bill(client, organization_id, "HELD-ONLY")

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 1 bill, so it can't be deleted."
    }


def test_an_organization_with_no_bills_still_cascades(client):
    organization_id = _supplier(client, "Free supplier")
    deal_id = _create_deal(client, organization_id, "Cascade deal")
    _create_activity(client, deal_id, "A note that goes with the organization")

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 200
    assert response.json()["counts"] == {
        "contacts": 0,
        "deals": 1,
        "activities": 1,
    }
