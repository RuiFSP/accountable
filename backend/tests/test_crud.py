import pytest
from app import db
from sqlalchemy import create_engine


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'crud.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


def _create_organization(client, name, website=None, industry=None):
    response = client.post(
        "/api/organizations",
        json={"name": name, "website": website, "industry": industry, "notes": None},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_contact(client, name, organization_id=None, status="lead", email=None):
    response = client.post(
        "/api/contacts",
        json={
            "name": name,
            "email": email,
            "phone": None,
            "job_title": None,
            "organization_id": organization_id,
            "status": status,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_deal(
    client,
    name,
    organization_id,
    contact_id,
    stage="New",
    value_cents=100_000,
    probability=10,
    close_date=None,
):
    response = client.post(
        "/api/deals",
        json={
            "name": name,
            "organization_id": organization_id,
            "contact_id": contact_id,
            "stage": stage,
            "value_cents": value_cents,
            "probability": probability,
            "close_date": close_date,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_activity(client, description, contact_id=None, deal_id=None, **overrides):
    payload = {
        "type": "note",
        "contact_id": contact_id,
        "deal_id": deal_id,
        "description": description,
        "happened_at": "2026-11-10T09:30:00",
        "follow_up_date": None,
        "done": False,
    }
    payload.update(overrides)
    response = client.post("/api/activities", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_read_update_organization(client):
    organization = _create_organization(
        client, "Kestrel Industries", "kestrel.example", "Agriculture"
    )

    response = client.put(
        f"/api/organizations/{organization['id']}",
        json={
            "name": "Kestrel Industries",
            "website": "kestrel.example",
            "industry": "Energy",
            "notes": "New notes",
        },
    )
    assert response.status_code == 200

    listed = client.get("/api/organizations").json()
    assert listed[0]["industry"] == "Energy"
    assert listed[0]["notes"] == "New notes"


def test_create_read_update_contact(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"], status="lead")

    response = client.put(
        f"/api/contacts/{contact['id']}",
        json={
            "name": "Tara Kestrel",
            "email": "tara@kestrel.example",
            "phone": "+1 555 0199",
            "job_title": "Director",
            "organization_id": organization["id"],
            "status": "customer",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "customer"

    listed = client.get("/api/contacts").json()
    assert listed[0]["email"] == "tara@kestrel.example"
    assert listed[0]["job_title"] == "Director"


def test_contact_rejects_an_organization_that_does_not_exist(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])

    bogus = {
        "name": "No Such Org",
        "email": None,
        "phone": None,
        "job_title": None,
        "organization_id": 999_999,
        "status": "lead",
    }
    assert client.post("/api/contacts", json=bogus).status_code == 400
    assert client.put(f"/api/contacts/{contact['id']}", json=bogus).status_code == 400

    # Nothing was written: the contact still belongs to its real organization.
    listed = client.get("/api/contacts").json()
    assert len(listed) == 1
    assert listed[0]["organization_id"] == organization["id"]


def test_create_read_update_deal(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    deal = _create_deal(
        client, "Kestrel pilot", organization["id"], contact["id"], stage="New"
    )
    assert deal["position"] == 0

    response = client.put(
        f"/api/deals/{deal['id']}",
        json={
            "name": "Kestrel pilot",
            "organization_id": organization["id"],
            "contact_id": contact["id"],
            "stage": "Proposal",
            "value_cents": 250_000,
            "probability": 50,
            "close_date": "2026-12-31",
            "position": 0,
        },
    )
    assert response.status_code == 200
    assert response.json()["close_date"] == "2026-12-31"

    listed = client.get("/api/deals").json()
    assert listed[0]["stage"] == "Proposal"
    assert listed[0]["value_cents"] == 250_000


def test_create_deal_gives_position_after_existing_stage(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    first = _create_deal(
        client, "First", organization["id"], contact["id"], stage="New"
    )
    second = _create_deal(
        client, "Second", organization["id"], contact["id"], stage="New"
    )
    other = _create_deal(
        client, "Other stage", organization["id"], contact["id"], stage="Won"
    )

    assert first["position"] == 0
    assert second["position"] == 1
    assert other["position"] == 0


def test_create_read_update_activity(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    activity = _create_activity(client, "First call", contact_id=contact["id"])

    response = client.put(
        f"/api/activities/{activity['id']}",
        json={
            "type": "call",
            "contact_id": contact["id"],
            "deal_id": None,
            "description": "Call rescheduled",
            "happened_at": "2026-11-11T14:00:00",
            "follow_up_date": "2026-11-20",
            "done": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["type"] == "call"
    assert response.json()["follow_up_date"] == "2026-11-20"
    assert response.json()["done"] is True


def test_search_matches_name_email_website(client):
    _create_organization(client, "Kestrel Industries", website="kestrel.example")
    _create_organization(client, "Mallard Foods", website="mallard.example")
    kestrel = next(
        o
        for o in client.get("/api/organizations").json()
        if o["name"] == "Kestrel Industries"
    )

    _create_contact(client, "Tara Kestrel", kestrel["id"], email="tara@kestrel.example")
    _create_contact(client, "Sam Mallard", kestrel["id"], email="sam@mallard.example")

    assert [
        row["name"]
        for row in client.get("/api/organizations", params={"q": "Kestrel"}).json()
    ] == ["Kestrel Industries"]
    assert [
        row["name"]
        for row in client.get(
            "/api/organizations", params={"q": "mallard.example"}
        ).json()
    ] == ["Mallard Foods"]
    assert [
        row["name"]
        for row in client.get("/api/contacts", params={"q": "Tara Kestrel"}).json()
    ] == ["Tara Kestrel"]
    assert [
        row["name"]
        for row in client.get("/api/contacts", params={"q": "sam@mallard"}).json()
    ] == ["Sam Mallard"]


def test_search_matches_deal_name(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    _create_deal(client, "Warehouse expansion", organization["id"], contact["id"])
    _create_deal(client, "Fleet renewal", organization["id"], contact["id"])

    matches = client.get("/api/deals", params={"q": "warehouse"}).json()
    assert [row["name"] for row in matches] == ["Warehouse expansion"]


def test_organizations_sort_by_each_column(client):
    _create_organization(
        client, "Beta Group", website="zeta.example", industry="Mining"
    )
    _create_organization(
        client, "Alpha Group", website="alpha.example", industry="Retail"
    )
    _create_organization(
        client, "Gamma Group", website="beta.example", industry="Farming"
    )

    def names(order):
        return [
            row["name"]
            for row in client.get(
                "/api/organizations", params={"sort": "name", "order": order}
            ).json()
        ]

    assert names("asc") == ["Alpha Group", "Beta Group", "Gamma Group"]
    assert names("desc") == ["Gamma Group", "Beta Group", "Alpha Group"]

    websites = [
        row["website"]
        for row in client.get(
            "/api/organizations", params={"sort": "website", "order": "asc"}
        ).json()
    ]
    assert websites == ["alpha.example", "beta.example", "zeta.example"]

    industries = [
        row["industry"]
        for row in client.get(
            "/api/organizations", params={"sort": "industry", "order": "asc"}
        ).json()
    ]
    assert industries == ["Farming", "Mining", "Retail"]


def test_contacts_sort_by_each_column(client):
    zeta = _create_organization(client, "Zeta Union")
    alpha = _create_organization(client, "Alpha Union")
    _create_contact(client, "Bo", zeta["id"], status="customer", email="bo@z.example")
    _create_contact(client, "Cy", alpha["id"], status="lead", email="cy@a.example")
    _create_contact(client, "Al", alpha["id"], status="qualified", email="al@a.example")

    def names(order):
        return [
            row["name"]
            for row in client.get(
                "/api/contacts", params={"sort": "name", "order": order}
            ).json()
        ]

    assert names("asc") == ["Al", "Bo", "Cy"]
    assert names("desc") == ["Cy", "Bo", "Al"]

    emails = [
        row["email"]
        for row in client.get("/api/contacts", params={"sort": "email"}).json()
    ]
    assert emails == ["al@a.example", "bo@z.example", "cy@a.example"]

    statuses = [
        row["status"]
        for row in client.get("/api/contacts", params={"sort": "status"}).json()
    ]
    assert statuses == ["customer", "lead", "qualified"]

    by_org = [
        row["name"]
        for row in client.get(
            "/api/contacts", params={"sort": "organization_name"}
        ).json()
    ]
    assert by_org == ["Cy", "Al", "Bo"]


def test_deals_sort_by_each_column(client):
    alpha = _create_organization(client, "Alpha Union")
    zeta = _create_organization(client, "Zeta Union")
    amy = _create_contact(client, "Amy", alpha["id"])
    zoe = _create_contact(client, "Zoe", zeta["id"])
    _create_deal(
        client,
        "Big deal",
        alpha["id"],
        amy["id"],
        stage="Won",
        value_cents=900_000,
        probability=100,
        close_date="2026-01-15",
    )
    _create_deal(
        client,
        "Small deal",
        zeta["id"],
        zoe["id"],
        stage="New",
        value_cents=50_000,
        probability=10,
        close_date="2027-03-01",
    )
    _create_deal(
        client,
        "Mid deal",
        alpha["id"],
        zoe["id"],
        stage="Proposal",
        value_cents=400_000,
        probability=50,
        close_date="2026-06-20",
    )

    by_value = [
        row["name"]
        for row in client.get("/api/deals", params={"sort": "value_cents"}).json()
    ]
    assert by_value == ["Small deal", "Mid deal", "Big deal"]

    by_stage = [
        row["name"] for row in client.get("/api/deals", params={"sort": "stage"}).json()
    ]
    assert by_stage == ["Small deal", "Mid deal", "Big deal"]  # New, Proposal, Won

    by_date = [
        row["name"]
        for row in client.get("/api/deals", params={"sort": "close_date"}).json()
    ]
    assert by_date == ["Big deal", "Mid deal", "Small deal"]

    def by_name(order):
        return [
            row["name"]
            for row in client.get(
                "/api/deals", params={"sort": "name", "order": order}
            ).json()
        ]

    assert by_name("asc") == ["Big deal", "Mid deal", "Small deal"]
    assert by_name("desc") == ["Small deal", "Mid deal", "Big deal"]

    by_org = [
        row["name"]
        for row in client.get("/api/deals", params={"sort": "organization_name"}).json()
    ]
    assert by_org == [
        "Big deal",
        "Mid deal",
        "Small deal",
    ]  # Alpha Union twice, then Zeta Union

    by_contact = [
        row["name"]
        for row in client.get("/api/deals", params={"sort": "contact_name"}).json()
    ]
    assert by_contact == [
        "Big deal",
        "Small deal",
        "Mid deal",
    ]  # Amy first, then Zoe's two by id


def test_activities_sort_by_each_column(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    _create_activity(
        client,
        "Alpha note",
        contact_id=contact["id"],
        happened_at="2026-01-05T09:00:00",
        type="note",
    )
    _create_activity(
        client,
        "Beta call",
        contact_id=contact["id"],
        happened_at="2026-03-05T09:00:00",
        type="call",
    )
    _create_activity(
        client,
        "Gamma email",
        contact_id=contact["id"],
        happened_at="2026-02-05T09:00:00",
        type="email",
    )

    by_happened = [
        row["description"]
        for row in client.get("/api/activities", params={"sort": "happened_at"}).json()
    ]
    assert by_happened == ["Alpha note", "Gamma email", "Beta call"]

    by_type = [
        row["type"]
        for row in client.get("/api/activities", params={"sort": "type"}).json()
    ]
    assert by_type == ["call", "email", "note"]

    reverse = [
        row["description"]
        for row in client.get(
            "/api/activities", params={"sort": "happened_at", "order": "desc"}
        ).json()
    ]
    assert reverse[0] == "Beta call"


def test_contacts_filter_by_status(client):
    organization = _create_organization(client, "Kestrel Industries")
    _create_contact(client, "Lead One", organization["id"], status="lead")
    _create_contact(client, "Customer One", organization["id"], status="customer")

    leads = client.get("/api/contacts", params={"status": "lead"}).json()
    assert [row["name"] for row in leads] == ["Lead One"]


def test_deals_filter_by_stage(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    _create_deal(
        client, "Open one", organization["id"], contact["id"], stage="Proposal"
    )
    _create_deal(
        client,
        "Closed one",
        organization["id"],
        contact["id"],
        stage="Won",
        probability=100,
    )

    won = client.get("/api/deals", params={"stage": "Won"}).json()
    assert [row["name"] for row in won] == ["Closed one"]


def test_invalid_sort_is_rejected(client):
    response = client.get("/api/organizations", params={"sort": "notes"})
    assert response.status_code == 422


def test_activity_requires_exactly_one_link(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])
    deal = _create_deal(client, "Kestrel pilot", organization["id"], contact["id"])

    no_link = client.post(
        "/api/activities",
        json={
            "type": "note",
            "contact_id": None,
            "deal_id": None,
            "description": "Floating note",
            "happened_at": "2026-11-10T09:30:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert no_link.status_code == 400

    both_links = client.post(
        "/api/activities",
        json={
            "type": "note",
            "contact_id": contact["id"],
            "deal_id": deal["id"],
            "description": "Both links",
            "happened_at": "2026-11-10T09:30:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert both_links.status_code == 400


def test_activity_rejects_stage_change_and_missing_targets(client):
    organization = _create_organization(client, "Kestrel Industries")
    contact = _create_contact(client, "Tara Kestrel", organization["id"])

    stage_change = client.post(
        "/api/activities",
        json={
            "type": "stage_change",
            "contact_id": contact["id"],
            "deal_id": None,
            "description": "Moved from New to Qualified",
            "happened_at": "2026-11-10T09:30:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert stage_change.status_code == 422

    missing_target = client.post(
        "/api/activities",
        json={
            "type": "note",
            "contact_id": 9999,
            "deal_id": None,
            "description": "Orphan",
            "happened_at": "2026-11-10T09:30:00",
            "follow_up_date": None,
            "done": False,
        },
    )
    assert missing_target.status_code == 400


def test_update_and_delete_missing_records_are_404(client):
    organization = _create_organization(client, "Kestrel Industries")

    assert (
        client.put(
            "/api/organizations/9999",
            json={"name": "Ghost", "website": None, "industry": None, "notes": None},
        ).status_code
        == 404
    )
    assert client.delete("/api/organizations/9999").status_code == 404
    assert client.delete(f"/api/contacts/{organization['id']}").status_code == 404
