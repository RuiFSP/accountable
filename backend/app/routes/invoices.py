"""Invoices: the home for the invoices change. It has no routes yet, so the app
does not change while the shared code is prepared."""

from fastapi import APIRouter

from app.holds import Hold

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

# The invoices change registers the invoice's deal and organization links here.
HOLDS: tuple[Hold, ...] = ()
