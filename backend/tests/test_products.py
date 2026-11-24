"""Products: create, read, update, list, archive and restore — never delete."""

import pytest
from app import db
from sqlalchemy import create_engine


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'products.db'}")
    db.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


def _create(client, name, description=None, price_cents=4_900):
    response = client.post(
        "/api/products",
        json={
            "name": name,
            "description": description,
            "price_cents": price_cents,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _names(client, **params):
    return [row["name"] for row in client.get("/api/products", params=params).json()]


def _archive(client, product_id):
    response = client.post(f"/api/products/{product_id}/archive")
    assert response.status_code == 200, response.text
    return response.json()


def _restore(client, product_id):
    response = client.post(f"/api/products/{product_id}/restore")
    assert response.status_code == 200, response.text
    return response.json()


def test_create_read_update_product(client):
    product = _create(
        client, "Starter license", "A single-team plan.", price_cents=4_900
    )

    assert product["name"] == "Starter license"
    assert product["description"] == "A single-team plan."
    assert product["price_cents"] == 4_900
    assert product["active"] is True

    listed = client.get("/api/products").json()
    assert [row["name"] for row in listed] == ["Starter license"]

    response = client.put(
        f"/api/products/{product['id']}",
        json={
            "name": "Starter license plus",
            "description": "Everything in Starter, with support.",
            "price_cents": 7_500,
        },
    )

    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["name"] == "Starter license plus"
    assert saved["description"] == "Everything in Starter, with support."
    assert saved["price_cents"] == 7_500
    assert saved["active"] is True

    listed = client.get("/api/products").json()
    assert [row["name"] for row in listed] == ["Starter license plus"]


def test_description_may_be_null(client):
    product = _create(client, "Team license")

    assert product["description"] is None
    assert client.get("/api/products").json()[0]["description"] is None


def test_prices_are_whole_cents(client):
    support = _create(client, "Priority support", price_cents=14_950)
    training = _create(client, "Onsite training day", price_cents=120_000)
    free = _create(client, "Pilot license", price_cents=0)

    assert support["price_cents"] == 14_950
    assert training["price_cents"] == 120_000
    assert free["price_cents"] == 0


def test_list_is_active_only_by_default(client):
    _create(client, "Active one")
    _create(client, "Active two")
    archived = _create(client, "Archived one")
    _archive(client, archived["id"])

    assert _names(client) == ["Active one", "Active two"]
    assert _names(client, include_archived="false") == ["Active one", "Active two"]
    assert set(_names(client, include_archived="true")) == {
        "Active one",
        "Active two",
        "Archived one",
    }


def test_q_matches_name_and_description(client):
    _create(client, "Starter license", "The core plan.")
    _create(client, "Remote training day", "A full day over video.")

    assert _names(client, q="starter") == ["Starter license"]
    assert _names(client, q="video") == ["Remote training day"]
    assert _names(client, q="LICENSE") == ["Starter license"]
    assert _names(client, q="nothing") == []


def test_products_sort_by_name_and_price(client):
    _create(client, "Beta license", price_cents=500)
    _create(client, "Alpha license", price_cents=100)
    _create(client, "Gamma license", price_cents=900)

    assert _names(client, sort="name") == [
        "Alpha license",
        "Beta license",
        "Gamma license",
    ]
    assert _names(client, sort="name", order="desc") == [
        "Gamma license",
        "Beta license",
        "Alpha license",
    ]
    assert _names(client, sort="price_cents") == [
        "Alpha license",
        "Beta license",
        "Gamma license",
    ]
    assert _names(client, sort="price_cents", order="desc") == [
        "Gamma license",
        "Beta license",
        "Alpha license",
    ]


def test_negative_prices_and_blank_names_are_refused(client):
    negative = client.post(
        "/api/products",
        json={"name": "Discount", "description": None, "price_cents": -1},
    )
    assert negative.status_code == 422

    blank = client.post(
        "/api/products",
        json={"name": "   ", "description": None, "price_cents": 100},
    )
    assert blank.status_code == 400
    assert blank.json() == {"detail": "Product name is required."}

    empty = client.post(
        "/api/products",
        json={"name": "", "description": None, "price_cents": 100},
    )
    assert empty.status_code == 422

    product = _create(client, "Real product")
    assert (
        client.put(
            f"/api/products/{product['id']}",
            json={
                "name": "Real product",
                "description": None,
                "price_cents": -5,
            },
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/products/{product['id']}",
            json={"name": "  ", "description": None, "price_cents": 100},
        ).status_code
        == 400
    )


def test_duplicate_names_are_refused_ignoring_case_and_whitespace(client):
    _create(client, "Priority support")
    other = _create(client, "Other product")

    for duplicate in ("PRIORITY SUPPORT", "  Priority support  ", "priority Support"):
        response = client.post(
            "/api/products",
            json={
                "name": duplicate,
                "description": None,
                "price_cents": 100,
            },
        )
        assert response.status_code == 400, duplicate
        assert response.json() == {
            "detail": 'A product named "Priority support" already exists.'
        }

    response = client.put(
        f"/api/products/{other['id']}",
        json={
            "name": "PRIORITY SUPPORT",
            "description": None,
            "price_cents": 100,
        },
    )
    assert response.status_code == 400
    # Nothing was written: the other product keeps its name.
    assert _names(client) == ["Priority support", "Other product"]


def test_an_archived_name_stays_reserved(client):
    legacy = _create(client, "Legacy add-on")
    _archive(client, legacy["id"])
    newer = _create(client, "New product")

    response = client.post(
        "/api/products",
        json={"name": "legacy ADD-ON", "description": None, "price_cents": 100},
    )
    assert response.status_code == 400

    response = client.put(
        f"/api/products/{newer['id']}",
        json={
            "name": "Legacy Add-On",
            "description": None,
            "price_cents": 100,
        },
    )
    assert response.status_code == 400


def test_updating_an_archived_product_keeps_it_archived(client):
    product = _create(client, "Legacy add-on", price_cents=3_900)
    _archive(client, product["id"])

    response = client.put(
        f"/api/products/{product['id']}",
        json={
            "name": "Legacy add-on",
            "description": "Kept for existing contracts.",
            "price_cents": 4_500,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["active"] is False
    assert response.json()["price_cents"] == 4_500
    assert _names(client) == []
    assert _names(client, include_archived="true") == ["Legacy add-on"]


def test_archive_and_restore_change_the_active_state(client):
    product = _create(client, "Pilot license")

    archived = _archive(client, product["id"])
    assert archived["active"] is False
    assert _names(client) == []
    assert _names(client, include_archived="true") == ["Pilot license"]

    restored = _restore(client, product["id"])
    assert restored["active"] is True
    assert _names(client) == ["Pilot license"]


def test_there_is_no_delete_route(client):
    product = _create(client, "Starter license")

    assert client.delete(f"/api/products/{product['id']}").status_code == 405
    assert _names(client) == ["Starter license"]


def test_unknown_products_are_404(client):
    assert (
        client.put(
            "/api/products/9999",
            json={"name": "Ghost", "description": None, "price_cents": 100},
        ).status_code
        == 404
    )
    assert client.post("/api/products/9999/archive").status_code == 404
    assert client.post("/api/products/9999/restore").status_code == 404
