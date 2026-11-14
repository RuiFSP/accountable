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

## Not started

- Phase 2 — Records: DataTable, four record sections and detail pages, activities and follow-ups.
- Phase 3 — Pipeline board and dashboard.
- Phase 4 — Brand pass, Playwright e2e suite, manual walkthrough in `docs/intent.md` criterion 8.

## Parked

- Anything outside the intent's "not in the MVP" list (sign-in, dark mode, mobile, AI, integrations, non-USD, tags, custom stages, import/export).
- `npm audit`: 7 moderate advisories in `minimatch` under `typescript-eslint` (dev tooling only); the fix downgrades typescript-eslint, so left alone for now.
