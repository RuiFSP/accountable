# Plan

## Files that change

- New `backend/app/tax.py` and `frontend/src/lib/tax.ts`, with `shared/totals-cases.json`, for the sums on a quote or an invoice.
- New `backend/app/documents.py`, migration `0005_number_counters.py`, and `number_counters` in `db.py`, for the company settings and the document numbers.
- New `backend/app/holds.py`; delete guards in `routes/deals.py` and `routes/organizations.py`; an error state in `ConfirmDialog` and the two tables.
- New `frontend/src/components/RecordPanels.tsx`; optional panels on `Deal.tsx` and `Organization.tsx`.
- New `frontend/src/pages/Money.tsx` and `pages/money/QuotesTab.tsx`, `InvoicesTab.tsx`, `BillsTab.tsx`; `/money` in `routes.tsx` and the top bar.
- New `components/StatusBadge.tsx`, `components/KpiCard.tsx`; `Modal` gains a wide layout; `DataTable` gains more than one filter.
- New `backend/app/routes/quotes.py`, `invoices.py` and `bills.py`, each empty; `main.py` includes them and puts their holds on the app.
- New `backend/app/months.py`; `stats.py` uses it. `lib/charts.ts` exports the axis and tooltip tokens.
- `seed.py` grows to 18 organizations, 24 contacts and 30 deals, with 12 won and 8 in Proposal or Negotiation.
- Docs: `docs/spec.md`, `docs/specs/design.md`, `company-settings.md`, `organizations.md`, `deals.md`, `tables.md`, `look-and-feel.md`, `running.md`, and new `docs/specs/money.md`.

## Order of work

1. The sums, the number counter, the holds and the months, with their tests.
2. The empty area routers, the Money page and the shared UI.
3. Panels, the delete dialogs, the API error list and the sample data.
4. Specs and layout tests, then `npm run check`.

## Risks

- The number counter must be atomic on SQLite and Postgres, and a failed save must roll its number back.
- Deleting an organization must check its deals as well as the organization, because SQLite foreign keys are off here.
- The Money page and the sample data are visible changes; the existing pages and actions must not change.
- The top bar must still fit at 1024px with seven links.
- The e2e screenshots change with the sample data.

## Proof

- Backend: `test_tax.py`, `test_documents.py`, `test_holds.py`, `test_months.py`, and updated `test_seed.py`, `test_reset.py`, `test_migrations.py`.
- Frontend: `tax.test.ts`, `RecordPanels.test.tsx`, `StatusBadge.test.tsx`, `ConfirmDialog.test.tsx`, `DataTable.test.tsx`, `routes.test.tsx` and the page tests.
- End to end: the top bar fits at 1024px, the Money tabs open, and the sample data counts come from the API rather than a fixed number.
- `npm run check` green, with the counts taken from its output.
