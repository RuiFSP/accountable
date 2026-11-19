"""Every API route refuses a caller who isn't signed in, in both copies."""

import pytest
from app import auth
from app.main import app as local_app


def _api_routes(app) -> set[tuple[str, str]]:
    """Every method on every route under /api, leaving out the sign-in routes."""
    pairs = set()
    for route in _routes_in(app):
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None) or set()
        if not path.startswith("/api") or path.startswith("/api/local"):
            continue
        pairs |= {
            (method, path) for method in methods if method not in {"HEAD", "OPTIONS"}
        }
    return pairs


def _routes_in(app):
    """Every route the app holds, through the routers it includes."""
    for route in app.routes:
        included = getattr(route, "original_router", None)
        if included is None:
            yield route
        else:
            yield from _routes_in(included)


ROUTES = sorted(_api_routes(local_app))


@pytest.mark.parametrize("method,path", ROUTES)
def test_every_api_route_refuses(method, path, client, shared_client, refused_tokens):
    """Each copy, with no token and with each token that must be turned away."""
    copies = (
        ("local", client, refused_tokens["local"]),
        ("shared", shared_client, refused_tokens["shared"]),
    )
    for label, copy, tokens in copies:
        for token_label, token in [("no token", None), *tokens.items()]:
            if token:
                copy.headers["Authorization"] = f"Bearer {token}"
            else:
                copy.headers.pop("Authorization", None)
            response = copy.request(method, path)
            where = f"{label} {token_label} {method} {path}"

            assert response.status_code == 401, f"{where}: {response.status_code}"
            assert response.json() == {"detail": auth.SIGN_IN_REQUIRED}, where


def test_the_two_copies_serve_the_same_api_routes(shared_app):
    """The shared copy serves every API route the local one does."""
    local = _api_routes(local_app)

    assert local, "no API routes found: the app's routing structure changed"
    assert _api_routes(shared_app) == local
