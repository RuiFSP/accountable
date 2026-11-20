"""What each copy of the sign-in check lets in, and what it turns away."""

import pytest
from app import auth
from app.main import app
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request


def _request(app) -> Request:
    """A request as the sign-in dependency sees it, without a server in between."""
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.1"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/organizations",
            "raw_path": b"/api/organizations",
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("127.0.0.1", 50000),
            "app": app,
        }
    )


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class _Clock:
    """monotonic() the test moves: the cooldown passes when it says so."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def pass_seconds(self, seconds: float) -> None:
        self.now += seconds


def test_the_teammates_route_lists_the_four(client):
    response = client.get("/api/local/teammates")

    assert response.status_code == 200
    teammates = response.json()
    assert len(teammates) == 4
    assert [teammate["id"] for teammate in teammates] == [
        teammate["id"] for teammate in auth.TEAMMATES
    ]
    assert all(set(teammate) == {"id", "name", "email"} for teammate in teammates)


def test_signing_in_gives_a_token_that_opens_the_api(client):
    response = client.post("/api/local/sign-in", json={"user_id": "alex"})

    assert response.status_code == 200
    signed_in = response.json()
    alex = next(t for t in auth.TEAMMATES if t["id"] == "alex")
    assert set(signed_in) == {"token", "email"}
    assert signed_in["email"] == alex["email"]

    client.headers["Authorization"] = f"Bearer {signed_in['token']}"
    assert client.get("/api/organizations").status_code == 200


def test_signing_in_refuses_an_unknown_id(client):
    response = client.post("/api/local/sign-in", json={"user_id": "nobody"})

    assert response.status_code == 404
    assert response.json() == {"detail": "No such teammate."}


def test_a_local_token_is_refused_from_another_host(client_for, sign_in_as):
    client = client_for(app, sign_in_as(), host=("192.168.1.50", 50000))

    response = client.get("/api/organizations")

    assert response.status_code == 401
    assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}
    # The sign-in routes are this machine's too, so from there they aren't there.
    assert client.get("/api/local/teammates").status_code == 404
    assert (
        client.post("/api/local/sign-in", json={"user_id": "alex"}).status_code == 404
    )


def test_a_good_shared_token_works_and_its_email_is_the_user(
    shared_app, shared_client, stand_in_keys
):
    assert shared_client.get("/api/organizations").status_code == 200

    token = stand_in_keys.token(email="someone@example.com")

    assert (
        auth.current_user(_request(shared_app), _credentials(token))
        == "someone@example.com"
    )


def test_an_unknown_key_id_fetches_the_keys_once_more(
    shared_client, key_fetch, stand_in_keys, monkeypatch
):
    clock = _Clock()
    monkeypatch.setattr(auth, "monotonic", clock)

    good = stand_in_keys.token()
    response = shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {good}"}
    )

    assert response.status_code == 200
    assert key_fetch.calls == 1
    assert key_fetch.urls == [f"{stand_in_keys.issuer}/.well-known/jwks.json"]

    clock.pass_seconds(auth.REFETCH_COOLDOWN)
    rotated = stand_in_keys.token(kid="a-key-we-dont-have")
    response = shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {rotated}"}
    )

    assert response.status_code == 401
    assert key_fetch.calls == 2


def test_a_new_key_id_costs_no_fetch_inside_the_cooldown(
    shared_client, key_fetch, stand_in_keys, monkeypatch
):
    # The key id arrives in an unauthenticated request, so the refetch is
    # rate-limited: inside the cooldown the cached set answers it with a no.
    clock = _Clock()
    monkeypatch.setattr(auth, "monotonic", clock)

    good = stand_in_keys.token()
    response = shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {good}"}
    )

    assert response.status_code == 200
    assert key_fetch.calls == 1

    rotated = stand_in_keys.token(kid="a-key-we-dont-have")
    for _ in range(3):
        response = shared_client.get(
            "/api/organizations", headers={"Authorization": f"Bearer {rotated}"}
        )

        assert response.status_code == 401
    assert key_fetch.calls == 1

    clock.pass_seconds(auth.REFETCH_COOLDOWN)
    shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {rotated}"}
    )

    assert key_fetch.calls == 2


def test_keys_that_cannot_be_fetched_give_the_503(
    shared_client, key_fetch, stand_in_keys
):
    key_fetch.unreachable = True
    token = stand_in_keys.token()

    response = shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 503
    assert response.json() == {"detail": auth.KEYS_UNREACHABLE}
    # Inside the cooldown the failure is remembered: no second attempt.
    response = shared_client.get(
        "/api/organizations", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 503
    assert key_fetch.calls == 1
    # With the keys out of reach nothing gets in, not even with no token.
    shared_client.headers.pop("Authorization", None)
    assert shared_client.get("/api/organizations").status_code == 401


def test_the_shared_copy_has_no_local_routes(shared_client):
    listing = shared_client.get("/api/local/teammates")
    signing_in = shared_client.post("/api/local/sign-in", json={"user_id": "alex"})

    assert listing.status_code == 404
    assert listing.json() == {"detail": "Not Found"}
    assert signing_in.status_code == 404
    assert signing_in.json() == {"detail": "Not Found"}


def test_no_token_is_refused_in_both_copies(client, shared_client):
    for copy in (client, shared_client):
        copy.headers.pop("Authorization", None)
        response = copy.get("/api/organizations")

        assert response.status_code == 401
        assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}


@pytest.mark.parametrize(
    "category",
    ["not a token", "expired", "another issuer", "another audience", "anonymous"],
)
def test_refused_in_both_copies(category, client, shared_client, refused_tokens):
    copies = (
        ("local", client, refused_tokens["local"]),
        ("shared", shared_client, refused_tokens["shared"]),
    )
    for label, copy, tokens in copies:
        copy.headers["Authorization"] = f"Bearer {tokens[category]}"
        response = copy.get("/api/organizations")

        assert response.status_code == 401, f"{label}: {response.text}"
        assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}, label


def test_an_hs256_token_is_refused_in_the_shared_copy(shared_client, stand_in_keys):
    # Signed with the public key, which must never work as a secret.
    token = stand_in_keys.token(algorithm="HS256")
    shared_client.headers["Authorization"] = f"Bearer {token}"

    response = shared_client.get("/api/organizations")

    assert response.status_code == 401
    assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}


def test_a_token_naming_no_key_is_refused_in_the_shared_copy(
    shared_client, stand_in_keys
):
    # Without a key id there is nothing to check the token against.
    token = stand_in_keys.token(kid="")
    shared_client.headers["Authorization"] = f"Bearer {token}"

    response = shared_client.get("/api/organizations")

    assert response.status_code == 401
    assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}
