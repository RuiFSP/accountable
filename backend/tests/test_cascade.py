import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app import db
from app.main import app


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'cascade.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture()
def client(engine, monkeypatch):
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    # No context manager on purpose: the lifespan would seed sample data.
    return TestClient(app)


def _post(client, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _build_fixture(client) -> dict:
    """Two organizations with their own contacts, deals and activities, plus one outsider."""
    org = _post(client, "/api/organizations", {"name": "Cascade Corp", "website": None, "industry": None, "notes": None})
    outsider_org = _post(client, "/api/organizations", {"name": "Outsider Inc", "website": None, "industry": None, "notes": None})

    first = _post(client, "/api/contacts", {"name": "First Contact", "email": None, "phone": None, "job_title": None, "organization_id": org["id"], "status": "lead"})
    second = _post(client, "/api/contacts", {"name": "Second Contact", "email": None, "phone": None, "job_title": None, "organization_id": org["id"], "status": "customer"})
    outsider = _post(client, "/api/contacts", {"name": "Outsider Contact", "email": None, "phone": None, "job_title": None, "organization_id": outsider_org["id"], "status": "lead"})

    alpha = _post(client, "/api/deals", {"name": "Alpha Deal", "organization_id": org["id"], "contact_id": first["id"], "stage": "New", "value_cents": 100, "probability": 10, "close_date": "2027-01-01"})
    beta = _post(client, "/api/deals", {"name": "Beta Deal", "organization_id": org["id"], "contact_id": second["id"], "stage": "Won", "value_cents": 200, "probability": 100, "close_date": "2026-01-01"})
    outsider_deal = _post(client, "/api/deals", {"name": "Outsider Deal", "organization_id": outsider_org["id"], "contact_id": outsider["id"], "stage": "New", "value_cents": 300, "probability": 10, "close_date": "2027-02-02"})

    def activity(description, contact_id=None, deal_id=None):
        return _post(client, "/api/activities", {
            "type": "note",
            "contact_id": contact_id,
            "deal_id": deal_id,
            "description": description,
            "happened_at": "2026-11-10T09:00:00",
            "follow_up_date": None,
            "done": False,
        })

    activity("Note on first contact", contact_id=first["id"])
    activity("Call with second contact", contact_id=second["id"])
    activity("Note on alpha deal", deal_id=alpha["id"])
    activity("Note on beta deal", deal_id=beta["id"])
    activity("Outsider note", contact_id=outsider["id"])

    return {"org": org, "outsider_org": outsider_org, "alpha": alpha, "beta": beta}


def test_deleting_an_organization_returns_its_cascade_lists(client):
    fixture = _build_fixture(client)
    organization_id = fixture["org"]["id"]

    response = client.delete(f"/api/organizations/{organization_id}")

    assert response.status_code == 200
    assert response.json() == {
        "contacts": ["First Contact", "Second Contact"],
        "deals": ["Alpha Deal", "Beta Deal"],
        "activities": [
            "Note on first contact",
            "Call with second contact",
            "Note on alpha deal",
            "Note on beta deal",
        ],
    }


def test_deleting_an_organization_removes_everything_linked_to_it(client):
    fixture = _build_fixture(client)
    client.delete(f"/api/organizations/{fixture['org']['id']}")

    organizations = [row["name"] for row in client.get("/api/organizations").json()]
    assert organizations == ["Outsider Inc"]

    contacts = [row["name"] for row in client.get("/api/contacts").json()]
    assert contacts == ["Outsider Contact"]

    deals = [row["name"] for row in client.get("/api/deals").json()]
    assert deals == ["Outsider Deal"]

    activities = [row["description"] for row in client.get("/api/activities").json()]
    assert activities == ["Outsider note"]


def test_deleting_a_contact_returns_and_removes_its_activities(client):
    fixture = _build_fixture(client)
    contacts = client.get("/api/contacts").json()
    first = next(row for row in contacts if row["name"] == "First Contact")

    response = client.delete(f"/api/contacts/{first['id']}")

    assert response.status_code == 200
    assert response.json() == {"activities": ["Note on first contact"]}

    remaining_contacts = [row["name"] for row in client.get("/api/contacts").json()]
    assert remaining_contacts == ["Second Contact", "Outsider Contact"]

    remaining_activities = [row["description"] for row in client.get("/api/activities").json()]
    assert "Note on first contact" not in remaining_activities
    assert "Note on alpha deal" in remaining_activities


def test_deleting_a_deal_returns_and_removes_its_activities(client):
    _build_fixture(client)
    deals = client.get("/api/deals").json()
    alpha = next(row for row in deals if row["name"] == "Alpha Deal")

    response = client.delete(f"/api/deals/{alpha['id']}")

    assert response.status_code == 200
    assert response.json() == {"activities": ["Note on alpha deal"]}

    remaining_deals = [row["name"] for row in client.get("/api/deals").json()]
    assert remaining_deals == ["Beta Deal", "Outsider Deal"]

    remaining_activities = [row["description"] for row in client.get("/api/activities").json()]
    assert "Note on alpha deal" not in remaining_activities
    assert "Note on first contact" in remaining_activities
