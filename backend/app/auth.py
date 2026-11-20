"""Who the caller is: the local sign-in on this computer, Supabase's on Render.

The local copy signs HS256 tokens for the made-up teammates with a key made
at start-up and kept in memory, and only answers callers on this machine. The
shared copy accepts only Supabase's ES256 and RS256 tokens, checked against
the project's public keys — fetched once, and once more only when a token
names a key id we don't have yet, at most once a minute so an unknown key id
can't cost an outbound fetch per request.
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any
from urllib.request import urlopen

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.types import Options
from pydantic import BaseModel

from app.settings import Settings

# The four made-up teammates the sample data comes with. One has no name, so
# showing a person has a case where the email is all there is to show.
TEAMMATES: tuple[dict[str, str], ...] = (
    {"id": "alex", "name": "Alex Rivera", "email": "alex@brightloop.example"},
    {"id": "priya", "name": "Priya Nair", "email": "priya@brightloop.example"},
    {"id": "joel", "name": "Joel Andersson", "email": "joel@brightloop.example"},
    {"id": "sam", "name": "", "email": "sam@brightloop.example"},
)

SIGN_IN_REQUIRED = "Sign in to use Accountable."
KEYS_UNREACHABLE = "Can't check your sign-in right now."

LOCAL_KEY = secrets.token_urlsafe(32)
LOCAL_ISSUER = "accountable-local"
LOCAL_AUDIENCE = "accountable"
LOCAL_ALGORITHM = "HS256"
LOCAL_LIFETIME = timedelta(hours=12)

SHARED_ALGORITHMS = ["RS256", "ES256"]
SHARED_AUDIENCE = "authenticated"

# How long a fetch attempt is remembered before another may happen: a key id
# we've never seen arrives in an unauthenticated request, so without this any
# caller could ask for one outbound fetch per request.
REFETCH_COOLDOWN = 60.0

# Beyond the signature, both copies check the same two things: an expiry and
# an email. `iat` is deliberately not one of them — a clock that steps (and
# clocks do) would reject a token signed moments earlier.
_CHECK_OPTIONS: Options = {"require": ["exp", "email"], "verify_iat": False}

_bearer = HTTPBearer(auto_error=False)


class KeysUnavailable(RuntimeError):
    """Supabase's keys couldn't be fetched, so no token can be checked."""


class SignInIn(BaseModel):
    user_id: str


class SignInOut(BaseModel):
    token: str
    email: str


def _is_loopback(request: Request) -> bool:
    """Whether the call came from this machine, which is where the local copy lives."""
    host = request.client.host if request.client else ""
    return host in {"::1", "localhost"} or host.startswith("127.")


def _loopback_only(request: Request) -> None:
    """The sign-in routes answer this machine and no other: elsewhere, they aren't there."""
    if not _is_loopback(request):
        raise HTTPException(status_code=404, detail="Not Found")


local = APIRouter(
    prefix="/api/local",
    tags=["local"],
    dependencies=[Depends(_loopback_only)],
)


@local.get("/teammates")
def teammates() -> list[dict[str, str]]:
    """Who you can sign in as on this computer, with no password to type."""
    return list(TEAMMATES)


@local.post("/sign-in")
def sign_in(payload: SignInIn) -> SignInOut:
    """A token for one of the made-up teammates."""
    teammate = next((t for t in TEAMMATES if t["id"] == payload.user_id), None)
    if teammate is None:
        raise HTTPException(status_code=404, detail="No such teammate.")
    return SignInOut(token=sign_local(teammate["email"]), email=teammate["email"])


def sign_local(email: str) -> str:
    """A token this copy signs for a teammate, good for a working session."""
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": email,
            "email": email,
            "iss": LOCAL_ISSUER,
            "aud": LOCAL_AUDIENCE,
            "iat": now,
            "exp": now + LOCAL_LIFETIME,
        },
        LOCAL_KEY,
        algorithm=LOCAL_ALGORITHM,
    )


def local_email(token: str) -> str | None:
    """The email this copy signed into a token, or None when it isn't one of ours."""
    try:
        claims = jwt.decode(
            token,
            LOCAL_KEY,
            algorithms=[LOCAL_ALGORITHM],
            issuer=LOCAL_ISSUER,
            audience=LOCAL_AUDIENCE,
            options=_CHECK_OPTIONS,
        )
    except jwt.PyJWTError:
        return None
    return _email_in(claims)


def _auth_base(supabase_url: str) -> str:
    """Where Supabase keeps its auth: the issuer of its tokens and its key set."""
    return f"{supabase_url.rstrip('/')}/auth/v1"


def fetch_jwks(supabase_url: str) -> Any:
    """Supabase's public signing keys. Raises when they can't be reached."""
    address = f"{_auth_base(supabase_url)}/.well-known/jwks.json"
    with urlopen(address, timeout=5) as response:
        return json.load(response)


class KeyStore:
    """The project's public keys: fetched once, and once more for a key id we don't have."""

    def __init__(self, supabase_url: str) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.issuer = _auth_base(supabase_url)
        self._keys: dict[str, Any] | None = None
        self._attempted_at: float | None = None

    def public_key(self, kid: str) -> Any | None:
        """The key with this id, refetching the set when the id is new to us.

        At most one fetch every REFETCH_COOLDOWN seconds: inside the cooldown
        a cached set answers a new key id with a no, and keys we've never
        had get the 503 without another attempt."""
        keys = self._keys
        if keys is not None and kid in keys:
            return keys[kid]
        if not self._refetch_due():
            if keys is None:
                raise KeysUnavailable()
            return None
        keys = self._fetch()
        return keys.get(kid)

    def _refetch_due(self) -> bool:
        return (
            self._attempted_at is None
            or monotonic() - self._attempted_at >= REFETCH_COOLDOWN
        )

    def _fetch(self) -> dict[str, Any]:
        self._attempted_at = monotonic()
        try:
            payload = fetch_jwks(self.supabase_url)
            keys = {entry["kid"]: _verify_key(entry) for entry in payload["keys"]}
        except Exception as error:
            raise KeysUnavailable() from error
        self._keys = keys
        return keys


def _verify_key(entry: dict[str, Any]) -> Any:
    """A key set entry as pyjwt verifies with: cryptography's own key."""
    return jwt.PyJWK.from_dict(entry).key


def _email_in(claims: dict[str, Any]) -> str | None:
    """The email claim, as long as there is one."""
    email = claims.get("email")
    return email if isinstance(email, str) and email else None


def _shared_email(keys: KeyStore, token: str) -> str | None:
    """The email in a Supabase token, or None when it isn't one worth trusting."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        return None
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        return None
    key = keys.public_key(kid)
    if key is None:
        return None
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=SHARED_ALGORITHMS,
            issuer=keys.issuer,
            audience=SHARED_AUDIENCE,
            options=_CHECK_OPTIONS,
        )
    except jwt.PyJWTError:
        return None
    return _email_in(claims)


def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """The signed-in user's email — the only say on who is acting.

    No token, or one that doesn't check out, is a 401. The shared copy with
    its keys out of reach is a 503: a caller we can't check is not let in.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail=SIGN_IN_REQUIRED)
    token = credentials.credentials
    settings: Settings = request.app.state.settings
    if settings.mode == "local":
        if not _is_loopback(request):
            raise HTTPException(status_code=401, detail=SIGN_IN_REQUIRED)
        email = local_email(token)
    else:
        try:
            email = _shared_email(request.app.state.keys, token)
        except KeysUnavailable:
            raise HTTPException(status_code=503, detail=KEYS_UNREACHABLE) from None
    if email is None:
        raise HTTPException(status_code=401, detail=SIGN_IN_REQUIRED)
    return email
