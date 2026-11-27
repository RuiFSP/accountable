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


def _product(client, name: str) -> dict:
    """A product of its own, because the shared sample data now seeds products."""
    return _post(
        client,
        "/api/products",
        {"name": name, "description": None, "price_cents": 10_000},
    )


def test_a_product_add_sets_both_the_emails(client):
    product = _product(client, "Who Product Add")

    assert product["created_by"] == ALEX
    assert product["updated_by"] == ALEX


def test_a_product_save_that_changes_a_value_sets_the_last_changed_one(
    client, sign_in_as
):
    product = _product(client, "Who Product Edit")
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client,
        f"/api/products/{product['id']}",
        {**product, "price_cents": 12_500},
    )

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA


def test_a_product_save_that_changes_nothing_does_not(client, sign_in_as):
    product = _product(client, "Who Product No-op")
    _as(client, sign_in_as, PRIYA)

    saved = _put(client, f"/api/products/{product['id']}", product)

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == ALEX


def test_archiving_and_restoring_a_product_moves_the_last_changed_one(
    client, sign_in_as
):
    product = _product(client, "Who Product Archive")
    _as(client, sign_in_as, PRIYA)

    archived = client.post(f"/api/products/{product['id']}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["active"] is False
    assert archived.json()["created_by"] == ALEX
    assert archived.json()["updated_by"] == PRIYA

    # Archiving an archived product changes nothing, so the line stays.
    _as(client, sign_in_as, ALEX)
    again = client.post(f"/api/products/{product['id']}/archive")
    assert again.json()["updated_by"] == PRIYA

    restored = client.post(f"/api/products/{product['id']}/restore")
    assert restored.json()["active"] is True
    assert restored.json()["created_by"] == ALEX
    assert restored.json()["updated_by"] == ALEX


def test_a_product_reply_carries_both_emails(client, sign_in_as):
    product = _product(client, "Who Product Reply")
    _as(client, sign_in_as, PRIYA)
    saved = _put(
        client,
        f"/api/products/{product['id']}",
        {**product, "description": "Now with a description."},
    )
    listed = next(
        item
        for item in client.get("/api/products").json()
        if item["id"] == product["id"]
    )

    assert product["created_by"] == ALEX
    assert product["updated_by"] == ALEX
    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA
    assert listed["created_by"] == ALEX
    assert listed["updated_by"] == PRIYA


def _bill_payload(organization_id: int, number: str) -> dict:
    return {
        "organization_id": organization_id,
        "bill_number": number,
        "bill_date": "2026-06-01",
        "due_date": None,
        "category": "Software",
        "amount_cents": 10_000,
        "tax_cents": 800,
        "notes": None,
    }


def _bill(client, organization_id: int, number: str) -> dict:
    """A bill of its own, with its own supplier and number, because the shared
    sample database now seeds bills."""
    return _post(client, "/api/bills", _bill_payload(organization_id, number))


def test_a_bill_add_sets_both_the_emails(client):
    organization = _organization(client, "Who Supplier Add")
    bill = _bill(client, organization["id"], "WHO-ADD")

    assert bill["created_by"] == ALEX
    assert bill["updated_by"] == ALEX


def test_a_bill_save_that_changes_a_value_sets_the_last_changed_one(client, sign_in_as):
    organization = _organization(client, "Who Supplier Edit")
    bill = _bill(client, organization["id"], "WHO-EDIT")
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client,
        f"/api/bills/{bill['id']}",
        {**_bill_payload(organization["id"], "WHO-EDIT"), "notes": "Changed."},
    )

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA


def test_a_bill_save_that_changes_nothing_does_not(client, sign_in_as):
    organization = _organization(client, "Who Supplier No-op")
    bill = _bill(client, organization["id"], "WHO-NOOP")
    _as(client, sign_in_as, PRIYA)

    saved = _put(
        client,
        f"/api/bills/{bill['id']}",
        _bill_payload(organization["id"], "WHO-NOOP"),
    )

    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == ALEX


def test_paying_and_unpaying_a_bill_move_the_last_changed_one(client, sign_in_as):
    organization = _organization(client, "Who Supplier Paid")
    bill = _bill(client, organization["id"], "WHO-PAID")
    _as(client, sign_in_as, PRIYA)

    paid = client.post(f"/api/bills/{bill['id']}/paid", json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["updated_by"] == PRIYA

    unpaid = client.post(f"/api/bills/{bill['id']}/unpaid")
    assert unpaid.status_code == 200, unpaid.text
    assert unpaid.json()["updated_by"] == PRIYA


def test_a_bill_reply_carries_both_emails(client, sign_in_as):
    organization = _organization(client, "Who Supplier Reply")
    bill = _bill(client, organization["id"], "WHO-REPLY")
    _as(client, sign_in_as, PRIYA)
    saved = _put(
        client,
        f"/api/bills/{bill['id']}",
        {**_bill_payload(organization["id"], "WHO-REPLY"), "tax_cents": 900},
    )
    listed = next(
        item for item in client.get("/api/bills").json() if item["id"] == bill["id"]
    )

    assert bill["created_by"] == ALEX
    assert bill["updated_by"] == ALEX
    assert saved["created_by"] == ALEX
    assert saved["updated_by"] == PRIYA
    assert listed["created_by"] == ALEX
    assert listed["updated_by"] == PRIYA
