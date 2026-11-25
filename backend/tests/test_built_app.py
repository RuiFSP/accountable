"""What the shared copy serves from the built frontend, and what the local one doesn't."""

import pytest
from app import main


@pytest.fixture()
def built(tmp_path, monkeypatch):
    """A stand-in frontend/dist, with a secret file just outside it."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(
        '<div id="root">Accountable</div>', encoding="utf-8"
    )
    (dist / "assets" / "app.js").write_text(
        "console.log('accountable');", encoding="utf-8"
    )
    (tmp_path / "secret.txt").write_text("not for the browser", encoding="utf-8")
    monkeypatch.setattr(main, "FRONTEND_DIST", dist)
    return dist


def test_a_built_file_is_served(built, shared_app, client_for):
    response = client_for(shared_app, None).get("/assets/app.js")

    assert response.status_code == 200
    assert response.text == "console.log('accountable');"
    assert "javascript" in response.headers["content-type"]


def test_an_unknown_address_gets_the_page(built, shared_app, client_for):
    client = client_for(shared_app, None)

    for address in ("/", "/organizations/3", "/deals/9/edit", "/settings"):
        response = client.get(address)

        assert response.status_code == 200, address
        assert '<div id="root">Accountable</div>' in response.text, address
    # A call to an address that only holds a page is not served a page.
    assert client.post("/organizations/3").status_code == 405


def test_an_unknown_api_address_gets_a_json_404(built, shared_app, client_for):
    response = client_for(shared_app, None).get("/api/nothing-here")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
    assert "Accountable" not in response.text


def test_traversal_cannot_reach_outside_the_folder(built, shared_app, client_for):
    response = client_for(shared_app, None).get("/%2e%2e/%2e%2e/secret.txt")

    assert response.status_code == 200
    assert "not for the browser" not in response.text
    assert '<div id="root">Accountable</div>' in response.text


def test_the_local_copy_serves_no_built_frontend(built, client):
    assert client.get("/").status_code == 404
    assert client.get("/assets/app.js").status_code == 404
