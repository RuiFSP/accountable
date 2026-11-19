"""Tests run on their own database, set before any app module is imported."""

import json
import os
import sqlite3
import tempfile
from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

_test_dir = tempfile.mkdtemp(prefix="accountable-tests-")
os.environ.setdefault("ACCOUNTABLE_DB", str(Path(_test_dir) / "test.db"))


# The databases are disposable and this filesystem's fsync is slow enough to
# cost a test the intent's one second, so they skip it: no test outlives the
# process that wrote to it.
@event.listens_for(Engine, "connect")
def _no_fsync_on_test_databases(dbapi_connection, _record) -> None:
    if isinstance(dbapi_connection, sqlite3.Connection):
        dbapi_connection.execute("PRAGMA synchronous = OFF")


# Every test client calls from here: the local copy only answers this machine.
LOOPBACK = ("127.0.0.1", 50000)
STAND_IN_SUPABASE_URL = "https://stand-in.supabase.example"


def _b64url(value: int) -> str:
    """A big number the way a JWK writes it: base64url, no padding."""
    length = (value.bit_length() + 7) // 8
    return urlsafe_b64encode(value.to_bytes(length, "big")).rstrip(b"=").decode("ascii")


class StandInKeys:
    """Supabase's signing keys stood in: one pair, its key set, and its tokens."""

    def __init__(self, supabase_url: str) -> None:
        self.issuer = f"{supabase_url}/auth/v1"
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        numbers = public_key.public_numbers()
        self.kid = "stand-in"
        self.private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        self.public_pem = public_key.public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.jwks = {
            "keys": [
                {
                    "kty": "RSA",
                    "kid": self.kid,
                    "alg": "RS256",
                    "use": "sig",
                    "n": _b64url(numbers.n),
                    "e": _b64url(numbers.e),
                }
            ]
        }

    def token(
        self,
        *,
        email: str | None = "teammate@example.com",
        issuer: str | None = None,
        audience: str = "authenticated",
        kid: str | None = None,
        expired: bool = False,
        algorithm: str = "RS256",
    ) -> str:
        """A Supabase-shaped token, carrying whichever flaw a test needs."""
        now = datetime.now(UTC)
        claims: dict[str, Any] = {
            "sub": "00000000-0000-4000-8000-000000000000",
            "iss": self.issuer if issuer is None else issuer,
            "aud": audience,
            "iat": now - timedelta(hours=2) if expired else now - timedelta(minutes=5),
            "exp": now - timedelta(hours=1) if expired else now + timedelta(hours=1),
        }
        if email is not None:
            claims["email"] = email
        if algorithm == "HS256":
            # HS256 has no business being here, and this is how an attacker
            # would try it: the public key, which must never work as a secret.
            key: bytes = self.public_pem.split(b"-----")[2]
        else:
            key = self.private_pem
        return jwt.encode(
            claims,
            key,
            algorithm=algorithm,
            headers={"kid": self.kid if kid is None else kid},
        )


class _KeySet:
    """What the stand-in Supabase answers a key request with: its key set."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_KeySet":
        return self

    def __exit__(self, *exc_info: object) -> bool:
        return False


def _local_token(
    email: str | None = "teammate@example.com",
    *,
    issuer: str | None = None,
    audience: str | None = None,
    expired: bool = False,
) -> str:
    """A token shaped like the local copy's, carrying the flaw it must refuse."""
    from app import auth

    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": email or "anonymous",
        "iss": auth.LOCAL_ISSUER if issuer is None else issuer,
        "aud": auth.LOCAL_AUDIENCE if audience is None else audience,
        "iat": now - timedelta(hours=2) if expired else now - timedelta(minutes=5),
        "exp": now - timedelta(hours=1) if expired else now + timedelta(hours=1),
    }
    if email is not None:
        claims["email"] = email
    return jwt.encode(claims, auth.LOCAL_KEY, algorithm=auth.LOCAL_ALGORITHM)


@pytest.fixture(scope="session")
def engine():
    """The app's own test database, with the sample data in it."""
    from app import db, seed

    database = db.get_engine()
    seed.ensure_seeded(database)
    return database


@pytest.fixture()
def sign_in_as():
    """A local token: the first made-up teammate, or whoever the email names."""
    from app import auth

    def sign_in(email: str | None = None) -> str:
        teammate = auth.TEAMMATES[0]["email"] if email is None else email
        return auth.sign_local(teammate)

    return sign_in


@pytest.fixture()
def client_for():
    """A client for a copy of the app, on this machine, carrying a token if given."""

    def build(app, token: str | None, *, host: tuple[str, int] = LOOPBACK):
        client = TestClient(app, client=host)
        if token:
            client.headers["Authorization"] = f"Bearer {token}"
        return client

    return build


@pytest.fixture()
def client(engine, monkeypatch, client_for, sign_in_as):
    """The local copy on this test's database, signed in as a made-up teammate.

    The lifespan stays off: starting the app would seed sample data into a
    database the test built itself.
    """
    from app import db
    from app.main import app

    monkeypatch.setattr(db, "get_engine", lambda: engine)
    return client_for(app, sign_in_as())


@pytest.fixture()
def shared_settings():
    """Settings for the shared copy, with the Supabase project stood in."""
    from app.settings import Settings

    return Settings(
        mode="shared",
        database_url="sqlite:///:memory:",
        supabase_url=STAND_IN_SUPABASE_URL,
        publishable_key="stand-in-publishable-key",
    )


@pytest.fixture(scope="session")
def stand_in_keys() -> StandInKeys:
    """An RSA key pair and its key set, made once for the whole run."""
    return StandInKeys(STAND_IN_SUPABASE_URL)


@pytest.fixture()
def key_fetch(monkeypatch, stand_in_keys):
    """Supabase's keys at the network: counted, and made unreachable on demand."""
    from app import auth

    state = SimpleNamespace(calls=0, urls=[], unreachable=False)

    def urlopen(address: str, timeout: int) -> _KeySet:
        state.urls.append(address)
        state.calls += 1
        if state.unreachable:
            raise OSError("no route to the stand-in Supabase")
        return _KeySet(stand_in_keys.jwks)

    monkeypatch.setattr(auth, "urlopen", urlopen)
    return state


@pytest.fixture()
def shared_app(shared_settings, key_fetch, engine):
    """The shared copy on the app's test database, with Supabase stood in.

    The engine comes first so the database is seeded before any request.
    """
    from app.main import create_app

    return create_app(shared_settings)


@pytest.fixture()
def shared_client(shared_app, client_for, stand_in_keys):
    """The shared copy, signed in with a stand-in token."""
    return client_for(shared_app, stand_in_keys.token())


@pytest.fixture()
def refused_tokens(stand_in_keys):
    """The tokens neither copy may let in, shaped for the copy they face."""
    return {
        "local": {
            "not a token": "not-a-token",
            "expired": _local_token(expired=True),
            "another issuer": _local_token(issuer="https://elsewhere.example/auth/v1"),
            "another audience": _local_token(audience="someone-elses-app"),
            "anonymous": _local_token(email=None),
        },
        "shared": {
            "not a token": "not-a-token",
            "expired": stand_in_keys.token(expired=True),
            "another issuer": stand_in_keys.token(
                issuer="https://elsewhere.example/auth/v1"
            ),
            "another audience": stand_in_keys.token(audience="someone-elses-app"),
            "anonymous": stand_in_keys.token(email=None),
        },
    }
