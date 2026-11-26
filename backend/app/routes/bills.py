"""Bills: the home for the bills change. It has no routes yet, so the app does
not change while the shared code is prepared."""

from fastapi import APIRouter

from app.holds import Hold

router = APIRouter(prefix="/api/bills", tags=["bills"])

# The bills change registers the bill's supplier organization link here.
HOLDS: tuple[Hold, ...] = ()
