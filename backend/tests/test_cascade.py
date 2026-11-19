import pytest
from app import db
from sqlalchemy import create_engine


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'cascade.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


def _post(client, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _build_fixture(client) -> dict:
    """Two organizations with their own contacts, deals and activities, plus one outsider."""
    org = _post(
        client,
        "/api/organizations",
        {"name": "Cascade Corp", "website": None, "industry": None, "notes": None},
    )
    outsider_org = _post(
        client,
        "/api/organizations",
        {"name": "Outsider Inc", "website": None, "industry": None, "notes": None},
    )

    first = _post(
        client,
        "/api/contacts",
        {
            "name": "First Contact",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": org["id"],
            "status": "lead",
        },
    )
    second = _post(
        client,
        "/api/contacts",
        {
            "name": "Second Contact",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": org["id"],
            "status": "customer",
        },
    )
    outsider = _post(
        client,
        "/api/contacts",
        {
            "name": "Outsider Contact",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": outsider_org["id"],
            "status": "lead",
        },
    )

    alpha = _post(
        client,
        "/api/deals",
        {
            "name": "Alpha Deal",
            "organization_id": org["id"],
            "contact_id": first["id"],
            "stage": "New",
            "value_cents": 100,
            "probability": 10,
            "close_date": "2027-01-01",
        },
    )
    beta = _post(
        client,
        "/api/deals",
        {
            "name": "Beta Deal",
            "organization_id": org["id"],
            "contact_id": second["id"],
            "stage": "Won",
            "value_cents": 200,
            "probability": 100,
            "close_date": "2026-01-01",
        },
    )
    _post(
        client,
        "/api/deals",
        {
            "name": "Outsider Deal",
            "organization_id": outsider_org["id"],
            "contact_id": outsider["id"],
            "stage": "New",
            "value_cents": 300,
            "probability": 10,
            "close_date": "2027-02-02",
        },
    )

    def activity(description, contact_id=None, deal_id=None):
        return _post(
            client,
            "/api/activities",
            {
                "type": "note",
                "contact_id": contact_id,
                "deal_id": deal_id,
                "description": description,
                "happened_at": "2026-11-10T09:00:00",
                "follow_up_date": None,
                "done": False,
            },
        )

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
        "counts": {"contacts": 2, "deals": 2, "activities": 4},
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
    _build_fixture(client)
    contacts = client.get("/api/contacts").json()
    first = next(row for row in contacts if row["name"] == "First Contact")

    response = client.delete(f"/api/contacts/{first['id']}")

    assert response.status_code == 200
    assert response.json() == {
        "activities": ["Note on first contact"],
        "counts": {"activities": 1},
    }

    remaining_contacts = [row["name"] for row in client.get("/api/contacts").json()]
    assert remaining_contacts == ["Second Contact", "Outsider Contact"]

    remaining_activities = [
        row["description"] for row in client.get("/api/activities").json()
    ]
    assert "Note on first contact" not in remaining_activities
    assert "Note on alpha deal" in remaining_activities


def test_deleting_a_deal_returns_and_removes_its_activities(client):
    _build_fixture(client)
    deals = client.get("/api/deals").json()
    alpha = next(row for row in deals if row["name"] == "Alpha Deal")

    response = client.delete(f"/api/deals/{alpha['id']}")

    assert response.status_code == 200
    assert response.json() == {
        "activities": ["Note on alpha deal"],
        "counts": {"activities": 1},
    }

    remaining_deals = [row["name"] for row in client.get("/api/deals").json()]
    assert remaining_deals == ["Beta Deal", "Outsider Deal"]

    remaining_activities = [
        row["description"] for row in client.get("/api/activities").json()
    ]
    assert "Note on alpha deal" not in remaining_activities
    assert "Note on first contact" in remaining_activities


def test_deleting_a_contact_clears_it_from_deals_that_keep(client):
    fixture = _build_fixture(client)
    first = next(
        row
        for row in client.get("/api/contacts").json()
        if row["name"] == "First Contact"
    )

    client.delete(f"/api/contacts/{first['id']}")

    alpha = next(
        row
        for row in client.get("/api/deals").json()
        if row["id"] == fixture["alpha"]["id"]
    )
    assert alpha["contact_id"] is None  # the deal stays, its main contact goes

    # Saving the deal again used to fail with "Contact does not exist".
    assert (
        client.put(f"/api/deals/{fixture['alpha']['id']}", json=alpha).status_code
        == 200
    )


def test_deleting_an_organization_clears_its_contacts_from_deals_it_keeps(client):
    owner = _post(
        client,
        "/api/organizations",
        {"name": "Link Owner", "website": None, "industry": None, "notes": None},
    )
    keeper = _post(
        client,
        "/api/organizations",
        {"name": "Link Keeper", "website": None, "industry": None, "notes": None},
    )
    contact = _post(
        client,
        "/api/contacts",
        {
            "name": "Shared Contact",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": owner["id"],
            "status": "lead",
        },
    )
    deal = _post(
        client,
        "/api/deals",
        {
            "name": "Keeper deal",
            "organization_id": keeper["id"],
            "contact_id": contact["id"],
            "stage": "New",
            "value_cents": 100,
            "probability": 10,
            "close_date": "2027-01-01",
        },
    )

    client.delete(f"/api/organizations/{owner['id']}")

    listed = next(
        row for row in client.get("/api/deals").json() if row["id"] == deal["id"]
    )
    assert listed["contact_id"] is None  # the deal survives without the contact
