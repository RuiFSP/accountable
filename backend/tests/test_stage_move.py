import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app import db
from app.main import app


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'stage.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture()
def client(engine, monkeypatch):
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    # No context manager on purpose: the lifespan would seed sample data.
    return TestClient(app)


def _setup(client) -> dict:
    org = client.post(
        "/api/organizations",
        json={"name": "Stage Corp", "website": None, "industry": None, "notes": None},
    ).json()
    contact = client.post(
        "/api/contacts",
        json={
            "name": "Sam Stage",
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": org["id"],
            "status": "lead",
        },
    ).json()
    return {"org": org, "contact": contact}


def _create_deal(client, setup, name, stage="New", probability=10, value_cents=100_000):
    response = client.post(
        "/api/deals",
        json={
            "name": name,
            "organization_id": setup["org"]["id"],
            "contact_id": setup["contact"]["id"],
            "stage": stage,
            "value_cents": value_cents,
            "probability": probability,
            "close_date": "2027-03-01",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _stage_entries(client, deal_id: int) -> list[dict]:
    entries = [
        activity
        for activity in client.get("/api/activities").json()
        if activity["deal_id"] == deal_id and activity["type"] == "stage_change"
    ]
    return entries


def test_stage_move_resets_probability_and_writes_an_entry(client):
    setup = _setup(client)
    deal = _create_deal(client, setup, "Manual deal", probability=60)  # hand-set probability

    response = client.post(f"/api/deals/{deal['id']}/stage", json={"stage": "Proposal", "position": 0})

    assert response.status_code == 200
    body = response.json()
    assert body["deal"]["stage"] == "Proposal"
    assert body["deal"]["probability"] == 50  # stage default, manual60 gone

    entries = _stage_entries(client, deal["id"])
    assert len(entries) == 1
    assert entries[0]["description"] == "Moved from New to Proposal"
    assert entries[0]["contact_id"] is None
    assert entries[0]["follow_up_date"] is None


def test_within_column_move_keeps_probability_and_writes_no_entry(client):
    setup = _setup(client)
    first = _create_deal(client, setup, "First")
    second = _create_deal(client, setup, "Second")
    third = _create_deal(client, setup, "Third")

    # A hand-set probability must survive a move within the same column.
    row = client.get("/api/deals").json()
    third_row = next(deal for deal in row if deal["id"] == third["id"])
    third_row["probability"] = 40
    assert client.put(f"/api/deals/{third['id']}", json=third_row).status_code == 200

    response = client.post(
        f"/api/deals/{third['id']}/stage", json={"stage": "New", "position": 0}
    )

    assert response.status_code == 200
    assert response.json()["deal"]["probability"] == 40
    positions = {deal["name"]: deal["position"] for deal in client.get("/api/deals").json()}
    assert positions == {"Third": 0, "First": 1, "Second": 2}
    assert _stage_entries(client, third["id"]) == []


def test_cross_stage_move_renumbers_both_columns(client):
    setup = _setup(client)
    first = _create_deal(client, setup, "First")
    _create_deal(client, setup, "Second")
    _create_deal(client, setup, "Third")

    client.post(f"/api/deals/{first['id']}/stage", json={"stage": "Proposal", "position": 0})

    positions = {deal["name"]: deal["position"] for deal in client.get("/api/deals").json()}
    assert positions["First"] == 0  # alone at the top of Proposal
    assert positions["Second"] == 0  # gap closed in New
    assert positions["Third"] == 1


def test_move_position_is_clamped_to_the_column(client):
    setup = _setup(client)
    first = _create_deal(client, setup, "First")
    _create_deal(client, setup, "Second")

    client.post(f"/api/deals/{first['id']}/stage", json={"stage": "New", "position": 99})

    positions = sorted(
        deal["position"] for deal in client.get("/api/deals").json()
    )
    assert positions == [0, 1]


def test_move_returns_updated_totals(client):
    setup = _setup(client)
    open_deal = _create_deal(client, setup, "Open one", value_cents=100_000)
    _create_deal(client, setup, "Won one", stage="Won", probability=100, value_cents=500_000)

    body = client.post(
        f"/api/deals/{open_deal['id']}/stage", json={"stage": "Negotiation", "position": 0}
    ).json()

    assert body["totals"]["board"] == {
        "value_cents": 100_000,
        "expected_cents": 75_000,  # open only:100_000 ×75%
        "count": 1,
    }
    assert body["totals"]["columns"]["Negotiation"] == {
        "count": 1,
        "value_cents": 100_000,
        "expected_cents": 75_000,
    }
    assert body["totals"]["columns"]["Won"] == {
        "count": 1,
        "value_cents": 500_000,
        "expected_cents": 500_000,
    }


def test_stage_change_entries_are_read_only(client):
    setup = _setup(client)
    deal = _create_deal(client, setup, "Moving deal")
    client.post(f"/api/deals/{deal['id']}/stage", json={"stage": "Won", "position": 0})
    entry = _stage_entries(client, deal["id"])[0]

    update = client.put(
        f"/api/activities/{entry['id']}",
        json={
            "type": "note",
            "contact_id": None,
            "deal_id": deal["id"],
            "description": "Rewrite history",
            "happened_at": "2026-11-10T09:00:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert update.status_code == 400

    assert client.delete(f"/api/activities/{entry['id']}").status_code == 400

    # The entry is still there, untouched.
    assert _stage_entries(client, deal["id"])[0]["description"] == "Moved from New to Won"


def test_moving_a_missing_deal_or_bad_stage_fails(client):
    assert (
        client.post("/api/deals/9999/stage", json={"stage": "Won", "position": 0}).status_code
        == 404
    )
    assert (
        client.post("/api/deals/1/stage", json={"stage": "Bogus", "position": 0}).status_code
        == 422
    )


def test_changing_the_stage_through_edit_moves_like_a_drag(client):
    setup = _setup(client)
    first = _create_deal(client, setup, "First")
    _create_deal(client, setup, "Second")
    _create_deal(client, setup, "Third", stage="Proposal", probability=50)

    # A hand-set probability on the deal being edited.
    row = next(deal for deal in client.get("/api/deals").json() if deal["id"] == first["id"])
    row["probability"] = 60
    assert client.put(f"/api/deals/{first['id']}", json=row).status_code == 200

    # Change the stage the way the edit dialog does: everything a drag does
    # must happen here too.
    row["stage"] = "Proposal"
    response = client.put(f"/api/deals/{first['id']}", json=row)

    assert response.status_code == 200
    updated = response.json()
    assert updated["stage"] == "Proposal"
    assert updated["probability"] == 50  # stage default, hand-set60 gone

    entries = _stage_entries(client, first["id"])
    assert [entry["description"] for entry in entries] == ["Moved from New to Proposal"]

    positions = {
        deal["name"]: (deal["stage"], deal["position"])
        for deal in client.get("/api/deals").json()
    }
    assert positions["First"] == ("Proposal", 1)  # appended after Third
    assert positions["Third"] == ("Proposal", 0)
    assert positions["Second"] == ("New", 0)  # gap closed in the old column
