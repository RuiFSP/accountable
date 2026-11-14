# Status

## How to run

- `npm run dev` — starts the backend (http://127.0.0.1:8000) and the frontend (http://localhost:5173) together; open the frontend and you land on the dashboard.
- `npm test` — backend (pytest) then frontend (Vitest); tests run on their own database.
- `npm run seed` — rebuilds the sample data, asking for confirmation before wiping anything.
- `npm run lint` — strict TypeScript, ESLint, Prettier check; `npm run format` writes formatting.

## Design (done)

- Intent refined via interview: cascade deletes, one-record activities, no org timeline, per-table search, 12-month dashboard range, neutral copy, Chrome/Edge only, confirmation on reset, done = success criteria in `docs/intent.md` verified by the user.
- `docs/spec.md` written: MVP requirements summary, concerns (offline fonts, stage probabilities, card positions, stage-change entries, chart choice, cascade confirmation) and the design — stack, data model, API, frontend libraries, brand look and feel.
- Dashboard mockup: `docs/mockups/dashboard.html` (preview in `docs/mockups/dashboard-check.png`) — KPIs, revenue line chart, deals-won bar chart, sales funnel, recent activity, follow-ups, in brand light mode.
- `docs/plan.md` written: files that change, four one-session phases (foundation → records → pipeline/dashboard → brand pass and tests), risks, and the unit + e2e proof list. Refined with strict TypeScript, ESLint + Prettier (default configs), and a "no abstraction without a second user" rule.

## Implemented

- Phase 1 — Foundation (2026-11-14): root npm scripts (`dev`, `test`, `seed` with confirmation, `lint`, `format`), FastAPI JSON API under `/api` with the four tables in SQLAlchemy Core on SQLite, sample-data seed (fills a new database at startup, `npm run seed` rebuilds it after confirmation), React/Vite shell with routes for the five sections, brand CSS tokens, brand fonts bundled in `frontend/public/fonts/` for offline use, typed API client. Backend tests: schema + seed coverage + seed/reset confirmation (12). Frontend tests: shell smoke test + API client (5). `npm run lint` and `npm test` green.
- Test wiring (2026-11-14): `npm test` runs backend (pytest), frontend (Vitest) and e2e (Playwright) together, all three always run, exit is non-zero if any fails. `playwright.config.ts` starts the app itself (`npm run dev`) on its own database (`accountable-e2e.db`, gitignored); `e2e/startup.spec.ts` covers what exists so far — dashboard landing, no console errors, five sections reachable, sample data through the API. The rest of the e2e suite (`crud`, `contacts`, `pipeline`, `activities`, `dashboard`) is Phase 4's work. Stop `npm run dev` before `npm test` (fixed ports, `reuseExistingServer: false`).
- Phase 2 — Records (2026-11-14): full CRUD on the API — list with `q` search, sort (per table, incl. joined organization/contact names), status/stage filters; create/update; delete returns the exact cascade lists (org → contacts + deals + their activities; contact/deal → activities) — covered by `test_crud.py` (17) and `test_cascade.py` (4). Frontend: shared `DataTable` on TanStack Table (pinned v8) with search, sortable headings, status/stage filter, add/edit modals; `ConfirmDialog` showing the cascaded list before anything is deleted (`src/lib/cascade.ts` computes it from loaded records); detail pages for organization (contacts + deals lists), contact and deal (details + newest-first timeline) with activity log/edit/delete and follow-up due labels; `Modal`, `Field`, `Timeline` components; `src/lib/money.ts`, `dates.ts`, `pipeline.ts`, `text.ts`. Frontend tests: DataTable behavior (5), cascade/confirm (4), money (5), dates (6), client (4), routes (3). Verified end to end in a browser (18-step walkthrough, clean console); 63 tests green in `npm test`.
  - Small deviations from the plan's file list: `Timeline.tsx` and `text.ts` added (the timeline is shared by two detail pages), `cascade.ts` holds the confirmation preview, `Field` labels associate via `htmlFor` + `aria-describedby` so hint/option text never leaks into accessible names.

## Not started

- Phase 3 — Pipeline board and dashboard.
- Phase 4 — Brand pass, full Playwright suite, manual walkthrough in `docs/intent.md` criterion 8.

## Parked

- Anything outside the intent's "not in the MVP" list (sign-in, dark mode, mobile, AI, integrations, non-USD, tags, custom stages, import/export).
- `npm audit`: 7 moderate advisories in `minimatch` under `typescript-eslint` (dev tooling only); the fix downgrades typescript-eslint, so left alone for now.
