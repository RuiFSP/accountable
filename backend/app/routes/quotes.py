"""Quotes: the home for the quotes change. It has no routes yet, so the app
does not change while the shared code is prepared."""

from fastapi import APIRouter

from app.holds import Hold

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

# The quotes change registers the quote's deal link here.
HOLDS: tuple[Hold, ...] = ()
