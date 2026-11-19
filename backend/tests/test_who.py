"""Who added a record and who changed it, on every kind of change the intent counts."""

from app import auth, db

ALEX = auth.TEAMMATES[0]["email"]
PRIYA = auth.TEAMMATES[1]["email"]


def _post(client, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _put(client, path: str, payload: dict) -> dict:
    response = client.put(path, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _as(client, sign_in_as, email: str) -> None:
    """Hand the client a different teammate's token."""
    client.headers["Authorization"] = f"Bearer {sign_in_as(email)}"


def _organization(client, name: str = "Who Corp") -> dict:
    return _post(
        client,
        "/api/organizations",
        {"name": name, "website": None, "industry": None, "notes": None},
    )


def _contact(client, organization_id: int, name: str = "Wendy Wu") -> dict:
    return _post(
        client,
        "/api/contacts",
        {
            "name": name,
            "email": None,
            "phone": None,
            "job_title": None,
            "organization_id": organization_id,
            "status": "lead",
        },
    )


def _deal(
    client,
    organization_id: int,
    contact_id: int,
    stage: str = "New",
    probability: int = 10,
) -> dict:
    return _post(
        client,
        "/api/deals",
        {
            "name": "Who Deal",
            "organization_id": organization_id,
            "contact_id": contact_id,
            "stage": stage,
            "value_cents": 100_000,
            "probability": probability,
            "close_date": None,
        },
    )


def _activity(client, contact_id: int) -> dict:
    return _post(
        client,
        "/api/activities",
        {
            "type": "note",
            "contact_id": contact_id,
            "deal_id": None,
            "description": "A note about Wendy",
            "happened_at": "2026-06-15T09:00:00",
            "follow_up_date": None,
            "done": False,
        },
    )


def _stage_entries(client, deal_id: int) -> list[dict]:
    return [
        entry
        for entry in client.get("/api/activities").json()
        if entry["deal_id"] == deal_id and entry["type"] == "stage_change"
    ]


def _deal_attribution(client) -> dict[int, str | None]:
    """Who last changed each deal, by id."""
    return {deal["id"]: deal["updated_by"] for deal in client.get("/api/deals").json()}


def _deal_positions(client) -> dict[int, int]:
    """Where each deal sits on the board, by id."""
    return {deal["id"]: deal["position"] for deal in client.get("/api/deals").json()}


def test_an_add_sets_both_the_emails(client):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"])
    activity = _activity(client, contact["id"])

    for record in (organization, contact, deal, activity):
        assert record["created_by"] == ALEX
        assert record["updated_by"] == ALEX


def test_a_save_that_changes_a_value_sets_the_last_changed_one(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client, f"/api/contacts/{contact['id']}", {**contact, "name": "Wendy Wu-Chan"}
    )

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA


def test_a_save_that_changes_nothing_does_not(client, sign_in_as):
    organization = _organization(client)
    activity = _activity(client, _contact(client, organization["id"])["id"])
    _as(client, sign_in_as, PRIYA)

    saved = _put(client, f"/api/activities/{activity['id']}", activity)

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == ALEX


def test_a_stage_move_counts(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"])
    _as(client, sign_in_as, PRIYA)

    moved = _put(
        client,
        f"/api/deals/{deal['id']}",
        {**deal, "stage": "Proposal", "probability": 50},
    )

    assert moved["created_by"] == ALEX
    assert moved["updated_by"] == PRIYA
    entries = _stage_entries(client, deal["id"])
    assert [entry["description"] for entry in entries] == ["Moved from New to Proposal"]
    assert entries[0]["created_by"] == PRIYA


def test_a_board_move_counts(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"])
    _as(client, sign_in_as, PRIYA)

    response = client.post(
        f"/api/deals/{deal['id']}/stage", json={"stage": "Qualified", "position": 0}
    )

    assert response.status_code == 200, response.text
    moved = response.json()["deal"]
    assert moved["created_by"] == ALEX
    assert moved["updated_by"] == PRIYA
    entries = _stage_entries(client, deal["id"])
    assert entries[0]["created_by"] == PRIYA


def test_a_follow_up_tick_counts(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    activity = _activity(client, contact["id"])
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client, f"/api/activities/{activity['id']}", {**activity, "done": True}
    )

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA


def test_changing_a_won_deal_s_contact_counts(client, sign_in_as):
    organization = _organization(client)
    first = _contact(client, organization["id"], name="First Contact")
    second = _contact(client, organization["id"], name="Second Contact")
    deal = _deal(client, organization["id"], first["id"], stage="Won", probability=100)
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client, f"/api/deals/{deal['id']}", {**deal, "contact_id": second["id"]}
    )

    assert saved["stage"] == "Won"
    assert saved["contact_id"] == second["id"]
    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA


def test_renumbering_the_other_cards_does_not_count(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    first = _deal(client, organization["id"], contact["id"])
    second = _deal(client, organization["id"], contact["id"])
    third = _deal(client, organization["id"], contact["id"])
    attribution_before = _deal_attribution(client)
    positions_before = _deal_positions(client)
    _as(client, sign_in_as, PRIYA)

    response = client.post(
        f"/api/deals/{first['id']}/stage", json={"stage": "New", "position": 0}
    )

    assert response.status_code == 200, response.text
    attribution_after = _deal_attribution(client)
    positions_after = _deal_positions(client)
    assert attribution_after[first["id"]] == PRIYA
    assert {
        deal_id: who
        for deal_id, who in attribution_after.items()
        if deal_id != first["id"]
    } == {
        deal_id: who
        for deal_id, who in attribution_before.items()
        if deal_id != first["id"]
    }
    # The cards around it did move; moving them changed nobody's line.
    assert any(
        positions_after[deal_id] != positions_before[deal_id]
        for deal_id in positions_after
        if deal_id != first["id"]
    )
    assert attribution_after[second["id"]] == ALEX
    assert attribution_after[third["id"]] == ALEX


def test_blanking_a_link_after_a_delete_does_not_count(client, sign_in_as):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"])
    _as(client, sign_in_as, PRIYA)

    response = client.delete(f"/api/contacts/{contact['id']}")

    assert response.status_code == 200, response.text
    stored = next(
        item for item in client.get("/api/deals").json() if item["id"] == deal["id"]
    )
    assert stored["contact_id"] is None
    assert stored["updated_by"] == ALEX


def test_a_body_naming_a_person_changes_nothing(client):
    response = client.post(
        "/api/organizations",
        json={
            "name": "Body Corp",
            "website": None,
            "industry": None,
            "notes": None,
            "created_by": "someone@example.com",
            "updated_by": "someone@example.com",
        },
    )

    assert response.status_code == 201, response.text
    organization = response.json()
    assert organization["created_by"] == ALEX
    assert organization["updated_by"] == ALEX

    saved = _put(
        client,
        f"/api/organizations/{organization['id']}",
        {**organization, "notes": "A note", "updated_by": "someone@example.com"},
    )
    assert saved["notes"] == "A note"
    assert saved["updated_by"] == ALEX


def test_replies_carry_the_emails(client):
    organization = _organization(client)
    contact = _contact(client, organization["id"])
    deal = _deal(client, organization["id"], contact["id"])
    activity = _activity(client, contact["id"])

    listed = [
        next(item for item in client.get(path).json() if item["id"] == record["id"])
        for path, record in (
            ("/api/organizations", organization),
            ("/api/contacts", contact),
            ("/api/deals", deal),
            ("/api/activities", activity),
        )
    ]

    for record in [organization, contact, deal, activity, *listed]:
        assert record["created_by"] == ALEX
        assert record["updated_by"] == ALEX


def test_old_records_give_null(client):
    with db.get_engine().begin() as connection:
        result = connection.execute(
            db.organizations.insert().values(name="Written Before This Change")
        )
        organization_id = db.inserted_id(result)

    listed = next(
        item
        for item in client.get("/api/organizations").json()
        if item["id"] == organization_id
    )

    assert listed["created_by"] is None
    assert listed["updated_by"] is None
