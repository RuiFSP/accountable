"""Search finds part of a name, in any case, and means only what it says."""

import pytest
from app import db
from sqlalchemy import create_engine


@pytest.fixture()
def engine(tmp_path):
    # Its own database, empty: what a search returns is only what this
    # test put there.
    test_engine = create_engine(f"sqlite:///{tmp_path / 'search.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


def _post(client, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _organization(client, name: str) -> dict:
    return _post(
        client,
        "/api/organizations",
        {"name": name, "website": None, "industry": None, "notes": None},
    )


def _contact(client, name: str, organization_id: int | None = None) -> dict:
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


def _deal(client, name: str, organization_id: int, contact_id: int) -> dict:
    return _post(
        client,
        "/api/deals",
        {
            "name": name,
            "organization_id": organization_id,
            "contact_id": contact_id,
            "stage": "New",
            "value_cents": 100_000,
            "probability": 10,
            "close_date": None,
        },
    )


def _product(client, name: str) -> dict:
    return _post(
        client,
        "/api/products",
        {"name": name, "description": None, "price_cents": 4_900},
    )


def _bill(client, organization_id: int, number: str) -> dict:
    return _post(
        client,
        "/api/bills",
        {
            "organization_id": organization_id,
            "bill_number": number,
            "bill_date": "2026-01-05",
            "due_date": None,
            "category": "Software",
            "amount_cents": 4_900,
            "tax_cents": 392,
            "notes": None,
        },
    )


def _search(client, q: str | None) -> list[dict]:
    response = client.get("/api/search", params={} if q is None else {"q": q})
    return response.json()


def _zzyzx(client) -> None:
    """One record of each kind, under a name nothing else carries."""
    organization = _organization(client, "Zzyzx Works")
    contact = _contact(client, "Zzyzx Person", organization["id"])
    _deal(client, "Zzyzx Deal", organization["id"], contact["id"])
    _product(client, "Zzyzx Product")


def test_finds_part_of_a_name_and_returns_the_four_kinds_in_name_order(client):
    _zzyzx(client)

    response = client.get("/api/search", params={"q": "zzy"})

    assert response.status_code == 200
    assert [(item["kind"], item["name"]) for item in response.json()] == [
        ("deal", "Zzyzx Deal"),
        ("contact", "Zzyzx Person"),
        ("product", "Zzyzx Product"),
        ("organization", "Zzyzx Works"),
    ]


def test_matches_in_any_case(client):
    _zzyzx(client)

    for q in ("ZZY", "zZy", "zzY"):
        assert [item["name"] for item in _search(client, q)] == [
            "Zzyzx Deal",
            "Zzyzx Person",
            "Zzyzx Product",
            "Zzyzx Works",
        ], q


def test_finds_an_active_product_and_leaves_an_archived_one_out(client):
    _product(client, "Zzyzx Product")
    archived = _product(client, "Zzyzx Retired Product")
    assert client.post(f"/api/products/{archived['id']}/archive").status_code == 200

    assert [
        (item["kind"], item["name"])
        for item in _search(client, "zzyzx product")
        if item["kind"] == "product"
    ] == [("product", "Zzyzx Product")]
    assert [
        item for item in _search(client, "retired") if item["kind"] == "product"
    ] == []


def test_finds_an_accented_name(client):
    _contact(client, "José Álvarez")

    for q in ("josé", "JOSÉ", "álvarez"):
        assert [item["name"] for item in _search(client, q)] == ["José Álvarez"], q


def test_percent_and_underscore_mean_only_themselves(client):
    _organization(client, "100% Fun Club")
    _organization(client, "snake_case_org")

    assert [item["name"] for item in _search(client, "%")] == ["100% Fun Club"]
    assert [item["name"] for item in _search(client, "_")] == ["snake_case_org"]
    assert [item["name"] for item in _search(client, "100% F")] == ["100% Fun Club"]


def test_a_bill_number_or_its_supplier_finds_no_top_bar_match(client):
    organization = _organization(client, "Zzyzx Supplier")
    _bill(client, organization["id"], "ZZY-2026-01")

    assert _search(client, "zzy-2026-01") == []
    # The supplier is found as an organization; the bill behind it is not.
    assert [
        (item["kind"], item["name"]) for item in _search(client, "zzyzx supplier")
    ] == [("organization", "Zzyzx Supplier")]


def test_a_blank_q_is_refused(client):
    for q in (None, "", "   "):
        response = client.get("/api/search", params={} if q is None else {"q": q})

        assert response.status_code == 400, q
        assert response.json() == {"detail": "Search needs a query."}
