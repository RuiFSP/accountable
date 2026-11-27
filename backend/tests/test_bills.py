"""The bill's rules and actions, on its own empty database."""

from datetime import date, timedelta

import pytest
from app import db
from sqlalchemy import create_engine

TODAY = date.today()


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'bills.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


def _organization(client, name="Kestrel Industries"):
    response = client.post(
        "/api/organizations",
        json={"name": name, "website": None, "industry": None, "notes": None},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _bill_payload(organization_id, **overrides):
    payload = {
        "organization_id": organization_id,
        "bill_number": "KS-001",
        "bill_date": TODAY.isoformat(),
        "due_date": None,
        "category": "Software",
        "amount_cents": 49_000,
        "tax_cents": 3_920,
        "notes": "Monthly platform subscription.",
    }
    payload.update(overrides)
    return payload


def _bill(client, organization_id, **overrides):
    response = client.post(
        "/api/bills", json=_bill_payload(organization_id, **overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_read_update_list_and_delete_a_bill(client):
    organization = _organization(client)
    created = _bill(client, organization["id"])
    assert created["organization_id"] == organization["id"]
    assert created["organization_name"] == "Kestrel Industries"
    assert created["bill_number"] == "KS-001"
    assert created["total_cents"] == 52_920
    assert created["status"] == "unpaid"
    assert created["paid_date"] is None

    updated = client.put(
        f"/api/bills/{created['id']}",
        json=_bill_payload(
            organization["id"],
            bill_number="KS-002",
            amount_cents=100_000,
            tax_cents=8_000,
        ),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["bill_number"] == "KS-002"
    assert updated.json()["total_cents"] == 108_000

    listed = client.get("/api/bills").json()
    assert len(listed) == 1
    assert listed[0]["organization_name"] == "Kestrel Industries"

    deleted = client.delete(f"/api/bills/{created['id']}")
    assert deleted.status_code == 200
    assert client.get("/api/bills").json() == []


def test_a_supplier_that_does_not_exist_is_refused(client):
    response = client.post("/api/bills", json=_bill_payload(999_999))

    assert response.status_code == 400
    assert response.json() == {"detail": "Organization does not exist"}


def test_the_total_is_the_sum_and_a_payloads_own_total_is_ignored(client):
    organization = _organization(client)

    created = client.post(
        "/api/bills",
        json=_bill_payload(organization["id"], total_cents=1),
    )

    assert created.status_code == 201, created.text
    assert created.json()["amount_cents"] == 49_000
    assert created.json()["tax_cents"] == 3_920
    assert created.json()["total_cents"] == 52_920


def test_negative_amounts_and_a_sum_past_the_column_are_refused(client):
    organization = _organization(client)

    for field in ("amount_cents", "tax_cents"):
        response = client.post(
            "/api/bills", json=_bill_payload(organization["id"], **{field: -1})
        )
        assert response.status_code == 422, field

    overflow = client.post(
        "/api/bills",
        json=_bill_payload(
            organization["id"],
            amount_cents=2_147_483_647,
            tax_cents=1,
        ),
    )
    assert overflow.status_code == 400
    assert overflow.json() == {"detail": "The total is larger than a bill can hold."}
    assert client.get("/api/bills").json() == []


def test_the_due_date_defaults_to_thirty_days_out_and_takes_any_date(client):
    organization = _organization(client)

    defaulted = _bill(client, organization["id"], bill_date="2026-01-10")
    assert defaulted["due_date"] == "2026-02-09"

    any_date = _bill(
        client,
        organization["id"],
        bill_number="KS-002",
        bill_date="2026-01-10",
        due_date="2025-12-25",
    )
    assert any_date["due_date"] == "2025-12-25"


def test_the_bill_number_is_trimmed_and_required(client):
    organization = _organization(client)

    created = _bill(client, organization["id"], bill_number="  KS-001  ")
    assert created["bill_number"] == "KS-001"

    blank = client.post(
        "/api/bills", json=_bill_payload(organization["id"], bill_number="   ")
    )
    assert blank.status_code == 400
    assert blank.json() == {"detail": "Bill number is required."}


def test_one_supplier_cannot_reuse_a_number_but_another_can(client):
    first = _organization(client, "First Supplier")
    second = _organization(client, "Second Supplier")
    _bill(client, first["id"], bill_number="PRIORITY SUPPORT")

    for bill_number in ("priority support", "  Priority Support  ", "PRIORITY SUPPORT"):
        refused = client.post(
            "/api/bills", json=_bill_payload(first["id"], bill_number=bill_number)
        )
        assert refused.status_code == 400, bill_number
        assert refused.json() == {
            "detail": 'A bill numbered "PRIORITY SUPPORT" already exists for this supplier.'
        }

    other_supplier = _bill(client, second["id"], bill_number="priority support")
    assert other_supplier["bill_number"] == "priority support"

    # An update is held to the same rule, without counting the bill itself.
    mine = _bill(client, second["id"], bill_number="SECOND-001")
    clash = client.put(
        f"/api/bills/{mine['id']}",
        json=_bill_payload(second["id"], bill_number="PRIORITY SUPPORT"),
    )
    assert clash.status_code == 400
    kept = client.put(
        f"/api/bills/{mine['id']}",
        json=_bill_payload(second["id"], bill_number="second-001"),
    )
    assert kept.status_code == 200
    assert kept.json()["bill_number"] == "second-001"


def test_status_is_derived_from_the_dates(client):
    organization = _organization(client)
    fresh = _bill(client, organization["id"])
    due_today = _bill(
        client,
        organization["id"],
        bill_number="KS-002",
        due_date=TODAY.isoformat(),
    )
    past_due = _bill(
        client,
        organization["id"],
        bill_number="KS-003",
        due_date=(TODAY - timedelta(days=1)).isoformat(),
    )

    assert fresh["status"] == "unpaid"
    assert due_today["status"] == "unpaid"
    assert past_due["status"] == "overdue"

    marked = client.post(f"/api/bills/{past_due['id']}/paid", json={})
    assert marked.status_code == 200, marked.text
    assert marked.json()["status"] == "paid"


def test_the_status_filter_divides_every_bill(client):
    organization = _organization(client)
    _bill(client, organization["id"], bill_number="KS-001", due_date=TODAY.isoformat())
    overdue = _bill(
        client,
        organization["id"],
        bill_number="KS-002",
        due_date=(TODAY - timedelta(days=2)).isoformat(),
    )
    paid = _bill(client, organization["id"], bill_number="KS-003")
    client.post(f"/api/bills/{paid['id']}/paid", json={})

    views = {
        status: [
            row["id"]
            for row in client.get("/api/bills", params={"status": status}).json()
        ]
        for status in ("unpaid", "overdue", "paid")
    }

    assert len(views["unpaid"]) == 1
    assert views["overdue"] == [overdue["id"]]
    assert views["paid"] == [paid["id"]]
    assert len(client.get("/api/bills").json()) == 3


def test_q_matches_the_supplier_name_and_the_bill_number(client):
    organization = _organization(client, "Northwind Traders")
    _bill(client, organization["id"], bill_number="NW-2026-04")

    by_supplier = client.get("/api/bills", params={"q": "northwind"}).json()
    assert [row["bill_number"] for row in by_supplier] == ["NW-2026-04"]
    by_number = client.get("/api/bills", params={"q": "nw-2026"}).json()
    assert [row["bill_number"] for row in by_number] == ["NW-2026-04"]
    assert client.get("/api/bills", params={"q": "nothing-like-this"}).json() == []


def test_the_list_sorts_by_supplier_number_dates_and_total(client):
    alpha = _organization(client, "Alpha Supplies")
    zeta = _organization(client, "Zeta Supplies")
    _bill(
        client,
        zeta["id"],
        bill_number="B-2",
        bill_date="2026-03-01",
        amount_cents=50_000,
    )
    _bill(
        client,
        alpha["id"],
        bill_number="A-3",
        bill_date="2026-01-01",
        amount_cents=30_000,
    )
    _bill(
        client,
        alpha["id"],
        bill_number="A-1",
        bill_date="2026-02-01",
        amount_cents=40_000,
    )

    def numbers(**params):
        return [
            row["bill_number"] for row in client.get("/api/bills", params=params).json()
        ]

    assert numbers(sort="organization_name") == ["A-3", "A-1", "B-2"]
    assert numbers(sort="bill_number") == ["A-1", "A-3", "B-2"]
    assert numbers(sort="bill_date") == ["A-3", "A-1", "B-2"]
    assert numbers(sort="total_cents") == ["A-3", "A-1", "B-2"]
    assert numbers(sort="bill_date", order="desc") == ["B-2", "A-1", "A-3"]


def test_the_supplier_filter_returns_one_organizations_bills(client):
    first = _organization(client, "First Supplier")
    second = _organization(client, "Second Supplier")
    mine = _bill(client, first["id"], bill_number="ONE")
    _bill(client, second["id"], bill_number="TWO")

    listed = client.get("/api/bills", params={"organization_id": first["id"]}).json()

    assert [row["id"] for row in listed] == [mine["id"]]


def test_marking_paid_records_the_day_and_marking_unpaid_clears_it(client):
    organization = _organization(client)
    bill = _bill(client, organization["id"])

    today_reply = client.post(f"/api/bills/{bill['id']}/paid", json={})
    assert today_reply.status_code == 200, today_reply.text
    assert today_reply.json()["paid_date"] == TODAY.isoformat()
    assert today_reply.json()["status"] == "paid"

    chosen = client.post(f"/api/bills/{bill['id']}/paid", json={"day": "2026-02-03"})
    assert chosen.json()["paid_date"] == "2026-02-03"

    cleared = client.post(f"/api/bills/{bill['id']}/unpaid")
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["paid_date"] is None
    assert cleared.json()["status"] == "unpaid"


def test_an_edit_never_changes_whether_the_bill_is_paid(client):
    organization = _organization(client)
    bill = _bill(client, organization["id"])
    marked = client.post(f"/api/bills/{bill['id']}/paid", json={"day": "2026-02-03"})
    assert marked.status_code == 200, marked.text

    edited = client.put(
        f"/api/bills/{bill['id']}",
        json=_bill_payload(organization["id"], notes="Changed notes"),
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["paid_date"] == "2026-02-03"

    client.post(f"/api/bills/{bill['id']}/unpaid")
    edited_again = client.put(
        f"/api/bills/{bill['id']}",
        json=_bill_payload(organization["id"], notes="Changed again"),
    )
    assert edited_again.json()["paid_date"] is None


def test_a_delete_always_goes_through(client):
    organization = _organization(client)
    bill = _bill(client, organization["id"])

    response = client.delete(f"/api/bills/{bill['id']}")

    assert response.status_code == 200
    assert response.json() == {"counts": {}}
    assert client.get("/api/bills").json() == []
    assert client.delete(f"/api/bills/{bill['id']}").status_code == 404


def test_deleting_an_organization_with_bills_is_refused(client):
    organization = _organization(client, "Held Supplier")
    _bill(client, organization["id"], bill_number="HELD-1")
    _bill(client, organization["id"], bill_number="HELD-2")

    response = client.delete(f"/api/organizations/{organization['id']}")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This organization has 2 bills, so it can't be deleted."
    }
    assert len(client.get("/api/bills").json()) == 2
