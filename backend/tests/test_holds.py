from app import db, holds
from app.main import app as local_app
from app.routes import quotes


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
    monkeypatch.setattr(
        local_app.state,
        "holds",
        (holds.Hold(db.activities.c.deal_id, "activity"),),
        raising=False,
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
        local_app.state,
        "holds",
        (holds.Hold(db.activities.c.deal_id, "activity"),),
        raising=False,
    )

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 1 activity, so it can't be deleted."
    }


def _create_quote(client, deal_id: int) -> int:
    # A seeded product, so this test adds nothing to the shared price list.
    product = client.get("/api/products").json()[0]
    response = client.post(
        "/api/quotes",
        json={
            "deal_id": deal_id,
            "valid_until": None,
            "lines": [
                {
                    "product_id": product["id"],
                    "description": None,
                    "quantity": 1,
                    "unit_price_cents": product["price_cents"],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_a_deal_with_quotes_refuses_to_be_deleted(client, monkeypatch):
    organization_id = _organization(client)
    deal_id = _create_deal(client, organization_id, "Quoted deal")
    _create_quote(client, deal_id)
    monkeypatch.setattr(local_app.state, "holds", quotes.HOLDS, raising=False)

    response = client.delete(f"/api/deals/{deal_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This deal has 1 quote, so it can't be deleted."
    }


def test_an_organization_is_held_through_the_quotes_on_its_deals(client, monkeypatch):
    organization = client.post(
        "/api/organizations",
        json={
            "name": "Quoted organization",
            "website": None,
            "industry": None,
            "notes": None,
        },
    )
    assert organization.status_code == 201, organization.text
    organization_id = organization.json()["id"]
    deal_id = _create_deal(client, organization_id, "Deal under the organization")
    _create_quote(client, deal_id)
    monkeypatch.setattr(local_app.state, "holds", quotes.HOLDS, raising=False)

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 1 quote, so it can't be deleted."
    }


def test_a_record_with_nothing_holding_it_is_still_deleted(client):
    organization_id = _organization(client)
    deal_id = _create_deal(client, organization_id, "Free deal")
    _create_activity(client, deal_id, "A note that goes with the deal")

    response = client.delete(f"/api/deals/{deal_id}")

    assert response.status_code == 200
    assert response.json()["counts"] == {"activities": 1}
