# Status

## How to run

- `npm run dev` — starts the backend (http://127.0.0.1:8000) and the frontend (http://localhost:5173) together; open the frontend and you land on the dashboard.
- `npm test` — backend (pytest), frontend (Vitest) and e2e (Playwright) together; tests run on their own database.
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
- Phase 3 — Pipeline and dashboard (2026-11-14): `POST /api/deals/{id}/stage` moves a card between or within columns — stage, default probability, renumbered positions, a system `stage_change` timeline entry (read-only: activity PUT/DELETE return400), and it returns fresh board/column totals; `stats.py` computes every dashboard figure in one module (12-month won buckets, open pipeline, expected revenue floored per deal, funnel + won/lost chips, recent activity, overdue/upcoming follow-ups) served by `GET /api/dashboard`, covered by `test_stage_move.py` (7) and `test_dashboard.py` (7). Frontend: `PipelineBoard.tsx` (dnd-kit) with drag between/within columns, optimistic updates, add-deal-per-column via the extracted `DealForm`, board/column totals, late cards tinted with a Late pill; dashboard page with KPI cards, Recharts area/bar charts, funnel bars, recent activity with type dots, follow-up groups with mark-done checkboxes; `lib/pipeline.ts` (totals, late flag, applyMove, renumber), `lib/charts.ts`, `lib/activity.ts`. Frontend tests: pipeline (9), charts (4), plus earlier suites —93 tests green in `npm test`. Verified in a real browser:12-step walkthrough for criteria4-6 (drags with asserted server round-trips, slot persistence after refresh, read-only stage entries, figures matched against independently computed API data, mark-done, mark-won deltas, clean console).
  - Two bugs found by that walkthrough and fixed: all four list endpoints iterated their results *after* closing the connection (materialized inside the `with` block now — this was causing `closed database`500s and cascading lock waits under parallel browser loads), and same-column drops computed the insert index after removing the dragged card (now the over-card's index in the full column, arrayMove parity).
- Phase 4 — Finish (2026-11-14): visual pass against `docs/mockups/dashboard.html` — top bar with wordmark + Sea Green dot, pill navigation, "New deal" action opening the deal form (`/deals?new=1`), serif italic dashboard subtitle, larger mono KPIs; brand rules held (bundled fonts, light mode, rounded panels, no edge borders, no gradients). Full e2e suite in `e2e/`: `helpers.ts` (sample-data reset via the real seed command, console watcher, date helper — always against `accountable-e2e.db`, computed explicitly so it can never touch real data) plus six specs — `startup`, `crud`, `contacts`, `pipeline`, `activities`, `dashboard` —25 tests covering intent criteria1-7, each spec file resetting to sample data first. Criterion8 walkthrough performed in a real browser with a full photo tour (screenshots in the session temp folder: `tour-01-dashboard.png` … `tour-07-deals.png`): every section and action exercised across the four phases' walkthroughs, **no console errors and no external requests at all** (all non-localhost traffic blocked — offline requirement holds). `npm test` green:115 tests total; `npm run lint` clean.
  - Per `docs/intent.md`, the MVP is called done only when the *user* verifies the criteria against that page — the automated and agent walkthroughs above are the preparation; the user's own pass on criterion8 is the remaining sign-off.

## Review against main (2026-11-14)

A review of the branch against `main` following `docs/REVIEW.md` — separate bugs, security and spec/plan passes, style excluded. Findings and their fixes:

**Important**

1. **Deleting a contact stranded its deals.** `deals.contact_id` kept pointing at the removed contact (SQLite foreign keys are not enforced), so `PUT /api/deals/{id}` answered `400 Contact does not exist` and the deal could not be saved again. Fixed: deleting a contact (or an organization's contacts) clears the link on any deal that keeps it, the deal form's Contact is optional ("None") like the contact form's Organization, and startup repairs links left dangling by earlier versions. Tests: `test_cascade.py`.
2. **Changing a stage in the edit dialog was a silent, half move.** `PUT /api/deals/{id}` changed the stage but wrote no `stage_change` timeline entry and kept the old column's position. Fixed: a stage change on update now behaves like `POST /deals/{id}/stage` — the new stage's default probability, a slot at the end of the new column, both columns renumbered, and a "Moved from X to Y" entry. Tests: `test_stage_move.py`.
3. **A won deal with a future close date vanished from the dashboard.** `won_summary` dropped `close_date > today`, and Won deals are excluded from the pipeline, so winning a deal before its expected close date showed it on no figure at all. Fixed: close dates are capped at today when bucketing, so the deal counts in the current month. Tests: `test_dashboard.py`.
4. **Contacts accepted a nonexistent organization.** `POST/PUT /api/contacts` wrote `organization_id` values pointing at nothing, while deals and activities validated their links. Fixed: `400 Organization does not exist`, through one shared `require_exists` helper (`app/routes/common.py`); startup also clears links already dangling. Tests: `test_crud.py`, `test_seed.py`.
5. **`opencode.jsonc` widened shell permissions** from `ask` to `allow`, unrelated to the product. Fixed: reverted to `ask`.

**Nits**

1. The cascade dialog keyed list items by their text, so two records sharing a name or description raised a React duplicate-key console error (intent criterion 8: no console errors). Fixed: keyed by group and position.
2. `docs/spec.md`, `docs/plan.md` and `docs/TECH_STACK.md` all say the e2e suite runs "on installed Chrome", but `playwright.config.ts` silently used Playwright's bundled Chromium — and this machine has no Chrome and no passwordless sudo to install it. Fixed: the config now asks Playwright for `channel: "chrome"` and only falls back to bundled Chromium on Linux when Chrome is absent at Playwright's expected path, so the docs hold everywhere Chrome is installed as `course/SETUP.md` requires.
3. `docs/plan.md`'s file list had drifted from the build (it listed `src/components/charts/`; the real files include `DealForm.tsx`, `Timeline.tsx`, `lib/charts.ts`, `lib/cascade.ts`, `lib/activity.ts`, `lib/text.ts`, `e2e/helpers.ts`). Fixed: plan updated to the real layout.
4. Delete endpoints returned cascaded names but no counts, where the spec says "the counts and names of cascaded records". Fixed: every delete response carries a `counts` map, asserted in `test_cascade.py`.
5. A failed pipeline drag was only logged to the browser console. Fixed: the board shows a visible, neutral error line until the next successful move.

After the fixes: `npm test` green — 121 tests (53 backend, 43 frontend, 25 e2e; six new backend tests cover the findings) — and `npm run lint` clean.

## Review against main, second pass (2026-11-14)

A second review of the branch against `main` following `docs/REVIEW.md` — separate bugs, security and spec/plan passes, style excluded. Security came back clean (no secrets or personal data, parameterized queries with whitelisted sort fields, same-origin API only, bundled fonts with no external requests). Findings and their fixes:

**Important**

1. **The top-bar "New deal" action was dead from the deals page.** `Deals.tsx` seeded its add-modal state from `?new=1` once with `useState`, and a search-param change on the same route never remounts the page — reproduced: the URL changed to `/deals?new=1` but no dialog opened (it worked when arriving from another section, which is why the suite never caught it). Fixed: the modal is now derived from the search params (`openAdd`/`closeAdd`), so the action works from any page and Cancel clears the parameter. Tests: `crud.spec.ts`.
2. **The delete dialog could understate the cascade.** Changing a deal's stage in the edit dialog writes a system `stage_change` row, but `handleUpdate` only invalidated `["deals"]` — reproduced: the server held 3 activities for the deal and the dialog listed 2, missing the entry written moments earlier (intent criterion 2: the confirmation "lists everything that will go"). Fixed: `refreshDealsAndActivities` invalidates both caches after an update and after a delete. Tests: `crud.spec.ts`.
3. **Late deals didn't stand out in the deals table.** Intent asks for it "in the table and on its pipeline card"; `isLate` was only wired to the card. Fixed: the close-date cell shows the `Late` pill with a raspberry date (`.late-date`), the same treatment as the card. Tests: `pipeline.spec.ts`.

**Nits**

1. `docs/plan.md` claimed `npm test` was green at 115 tests (47 backend); the suite runs 123 (53 backend, 27 e2e). Fixed: counts updated.
2. `docs/STATUS.md`'s "How to run" said `npm test` runs backend then frontend, leaving out the e2e run described further down. Fixed.
3. The plan's file list said only two files were edited; the build also added the `AGENTS.md` Testing section and reformatted `opencode.jsonc`. Fixed: the plan's Edited list now matches.

Also resolved from this document's Parked list: the 7 moderate `npm audit` advisories (`minimatch` under `typescript-eslint`) are gone without downgrading `typescript-eslint` — a root `overrides` pin to `minimatch@^11.0.8`, the patched line eslint already used; `npm audit` reports 0 vulnerabilities.

After the fixes: `npm test` green — 123 tests (53 backend, 43 frontend, 27 e2e; two new regression tests plus a late-deal assertion in the pipeline spec cover the findings) — and `npm run lint` clean.

## Shared (2026-11-14)

- The day's documents — `docs/intent.md`, `docs/spec.md`, `docs/plan.md`, `docs/REVIEW.md`, with a short README linking to the build — copied to `community_contributions/rui-mvp-docs/` and shared in a PR against Ed's `main`: https://github.com/ed-donner/accountable/pull/4 (branch `share-mvp-docs`).

## Not started

- All four phases of `docs/plan.md` are implemented, `npm test` is green (123 tests) and `npm run lint` is clean.
- **The MVP is accepted**: the user verified it in a real browser and signed off on 2026-11-14 ("i'm happy with mvp"), which is the criterion-8 bar set by `docs/intent.md`.
- Out of MVP scope and parked for later intents: sign-in and multiple users, deployment, and the other exclusions listed in `docs/intent.md`.

## Parked

- Anything outside the intent's "not in the MVP" list (sign-in, dark mode, mobile, AI, integrations, non-USD, tags, custom stages, import/export).
