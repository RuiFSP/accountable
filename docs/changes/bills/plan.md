# Plan: bills

Based on `docs/changes/bills/intent.md` (the bar) and `docs/spec.md` with `docs/specs/bills.md`, `docs/specs/dashboard.md` and `docs/specs/money.md` (the product). The spec already describes the change — it landed on this branch as "Design: the spec", with `bills.md` new and `dashboard.md`, `design.md`, `look-and-feel.md`, `money.md`, `organizations.md`, `running.md`, `sign-in.md` and `tables.md` updated — so this plan builds to it and carries no spec edits of its own. This plan stops at the build; ui-check, the review and `docs/IMPROVE.md` come later. No code written yet.

Working rule: status is derived from `paid_date` and `due_date`, never stored; the backend owns the total and the bill-number rule; a bill has no detail page — the Bills tab's table and dialog carry everything, and the organization's bills panel only lists. No new dependencies.

## Files that change

**New — backend**

- `backend/app/routes/bills.py` — replaces the placeholder. `BillIn` (organization_id, bill_number, bill_date, due_date, category, amount_cents, tax_cents, notes — no total, no paid date), list (`q` over the supplier's name and the bill number with `ilike`, sort and order over the columns the table shows, a `status` filter of unpaid/overdue/paid, an `organization_id` supplier filter; the join with organizations carries the supplier's name into each row), create, update, delete, `POST /api/bills/{id}/paid` (the body's day, defaulting to today) and `POST /api/bills/{id}/unpaid`. `total_cents` is `amount_cents` + `tax_cents`, written by the backend and ignoring any total in the payload; amounts are whole cents, zero or more, and the sum must fit the integer column. The bill number is required and trimmed, unique per supplier compared `casefold()` in Python on create and update, so SQLite and Postgres answer the same. `due_date` is optional and defaults to `bill_date` + 30 days; any date is accepted. Update never touches `paid_date`. Status comes from one `bill_status` helper the routes and `stats.py` share: paid when `paid_date` is set, overdue when unpaid and `due_date` is before today, else unpaid — due today is unpaid. `today` defaults the way `stats.py` does and is injectable for tests. `HOLDS` registers the supplier link: `Hold(db.bills.c.organization_id, "bill")`. Uses `read_or_404`, `require_exists`, `stamp_created` and `stamp_updated`.
- `backend/migrations/versions/0007_bills.py` — creates `bills` (`id`, `organization_id` foreign key to organizations, `bill_number`, `bill_date`, `due_date`, `category`, `amount_cents`, `tax_cents`, `total_cents`, `notes`, `paid_date`, `created_by`, `updated_by`) and enables row-level security on Postgres. Down revision `0006`: the quotes change took `0006` from the merge base too, so merging the two gives bills the next number.
- `backend/tests/test_bills.py` — the bill's rules and actions, on its own empty SQLite database like `test_crud.py`.

**Edited — backend**

- `backend/app/db.py` — the `bills` Table (dates as Date, the three money columns non-null, `paid_date` nullable, attribution columns); the table count in the module docstring moves on.
- `backend/app/stats.py` — the payables half of `dashboard_payload`: `unpaid` (total and count — Bills to pay, tax included), `overdue` (total and count), `due_soon` (total and count plus the timeline rows: supplier, due date and total, soonest first) and `spending` (one row per month over the same 12 buckets `months.py` gives, with a cents figure per category, counting each paid bill's total in its paid month; unpaid bills nowhere). Built from the same `bill_status` helper the list filter uses, with `today` injectable like the rest of the file.
- `backend/app/seed.py` — three supplier organizations added for the purpose (a software vendor, a contractor and an office landlord) and their bills over the last twelve months: regular monthly bills from each supplier plus occasional large one-offs, most paid with paid days spread across the twelve months so every month of the spending chart has bars, some unpaid and a few overdue, every category used. A few dozen rows only, inserted through `insert_sample` so each carries attribution.
- `backend/tests/test_dashboard.py` — the payables figures, the timeline and the spending buckets, with a fixed `today` for every date edge.
- `backend/tests/test_seed.py` — the tables list and the schema-count expectation gain bills (seven tables become eight); the supplier organizations; bills in every one of the last twelve months, unpaid and overdue bills present, every category used, every bill attributed, and the API serving bills.
- `backend/tests/test_migrations.py` — `bills` in `RECORD_TABLES`; the pre-change database upgrades to `0006` and keeps its rows; the migrated and metadata schemas agree; Postgres offline SQL creates the table with its foreign key and enables row-level security.
- `backend/tests/test_reset.py` — bills in the tables list and the dirtied data; the reset leaves version `0006` and the schema agreeing.
- `backend/tests/test_who.py` — bill attribution on add, edit, paid, unpaid and a save that changes nothing; bill replies carry both emails. Each test uses its own supplier and bill number, since the shared sample database now seeds bills.
- `backend/tests/test_holds.py` — a real bill holds its supplier organization, replacing the stand-in only where the bill is concerned.
- `backend/tests/test_search.py` — a bill number or supplier name finds no top-bar match; the four kinds' expectations unchanged.

**New — frontend**

- `frontend/src/pages/money/BillsTab.tsx` — replaces the placeholder. `DataTable` of bills: supplier, bill number, bill date, due date, category (its dot beside its name), total (`formatUsd` in the shared mono money style), status (`StatusBadge`, Unpaid Cerulean, Overdue Raspberry, Paid Sea Green) and — for a paid bill — its paid date. `searchFields` matches the supplier's name and the bill number. A status filter whose Unpaid, Overdue and Paid views divide every bill, with everything in front of them. Row actions: Mark paid (one click, today) or Mark unpaid, Edit and Delete behind the confirm dialog. Failures leave the row and show a message; loading, error and empty states.
- `frontend/src/pages/money/BillsTab.test.tsx` — the page's unit proof.
- `frontend/src/pages/money/BillForm.tsx` — the add and edit dialog: supplier chosen from the organizations, bill number, bill date, due date, amount before tax, tax, category and notes. The due date starts 30 days after the bill date and keeps following it until the due date is edited by hand in the dialog. Amounts are typed as dollars through `parseUsdToCents`, and the total previews as amount plus tax. On edit it pre-fills and shows `RecordAttribution` — who added the bill and who last changed it. The API's messages, the duplicate bill number among them, show in the form. It sends no total and no paid date.
- `frontend/src/pages/money/BillForm.test.tsx` — the form's unit proof.
- `frontend/src/pages/money/OrganizationBills.tsx` — the organization's bills panel: the record's bills with their number, due date, total and status, read-only, from `api.bills.list` with the supplier filter, with its empty state.
- `frontend/src/pages/money/OrganizationBills.test.tsx` — the panel's unit proof.
- `frontend/src/lib/bills.ts` — the six categories in order with their color reference (Software Sea Green, Contractors Marigold, Travel Coral, Office Cerulean, Marketing Raspberry, Other on ink-muted), the status tone map and the bill's derived status — shared so neither the money pages nor the dashboard owns them.
- `frontend/src/lib/bills.test.ts` — the shared values' proof.

**Edited — frontend**

- `frontend/src/api/client.ts` — `Bill` (with the supplier's name and a derived `status`), `BillInput`, `BillStatus`; `api.bills.list(q, status, organizationId)`, `create`, `update`, `remove`, `markPaid(id, day?)` and `markUnpaid(id)`; `DashboardPayload` gains the payables block the backend now serves.
- `frontend/src/api/client.extra.test.ts` — the bills requests, including the list's query and the paid/unpaid pair, and the dashboard payload's new block.
- `frontend/src/pages/Dashboard.tsx` — the Money section below the sales charts, as small module-level components in the same file: the three `KpiCard`s (Bills to pay with its count, Overdue, Due in the next 30 days), the timeline of the bills due in the next 30 days (supplier, due date, total, soonest first, and a line when nothing is due) and the stacked spending-by-category bar chart (one bar per month over the same 12 months as the sales charts, one segment per category in its color, the legend's dots matching). Each function stays under the complexity cap.
- `frontend/src/pages/Dashboard.test.tsx` — the Money section's unit proof.
- `frontend/src/lib/charts.ts` — the spending-bars helper and its types, beside `chartMonths` and `funnelBars`.
- `frontend/src/lib/charts.test.ts` — the helper's proof.
- `frontend/src/routes.tsx` — `ORGANIZATION_PANELS` gains the bills panel; the `/money/bills/*` route already carries the tab.
- `frontend/src/routes.extra.test.tsx` — the mocked API gains bills; the organization page renders its bills panel. (`routes.test.tsx` needs no change: it renders the routes against a failing fetch, not a mocked API.)
- `frontend/src/styles/brand.css` — the category dot classes on the existing tokens, so `colors.test.ts`'s one-place rule still holds and no new palette entries appear.

**New — end-to-end**

- `e2e/bills.spec.ts` — the Bills tab end to end.

**Edited — end-to-end**

- `e2e/dashboard.spec.ts` — the Money section's figures, timeline and spending chart against the data behind them.
- `e2e/startup.spec.ts` — sample bills on `/money/bills` and `/api/bills` answering.
- `e2e/security.spec.ts` — `/api/bills` in the no-token sample.

**Edited — docs**

- `README.md` — bills in the feature list and the dashboard line; keep it short.
- `docs/STATUS.md` — after the build, with the exact counts and coverage from the run output, not from memory.
- `docs/changes/bills/plan.md` — this file, if the plan changes.

**Untouched**

`backend/app/main.py` already includes the bills router and the bill's hold; `records.py`, `holds.py`, `months.py`, `documents.py`, `tax.py` and `search.py` need no edits. `frontend/src/pages/Money.tsx` keeps its tab strip, `DataTable.tsx` already carries search, filters and a row action, `SearchBox.tsx` keeps bills out of the top bar, and `RecordPanels.tsx` is used as it stands. `e2e/helpers.ts`, `e2e/menu.spec.ts`, `e2e/screenshots.spec.ts`, `scripts/e2e.mjs`, `playwright.config.ts`, `render.yaml` and both `package.json`s stay as they are: no new dependencies. `docs/spec.md` and `docs/specs/` are already updated on this branch. `docs/IMPROVE.md` comes after this plan.

## Order of work

### Phase 1 — Backend record and API

Add the `bills` table to `db.py`, migration `0006` and the real `app/routes/bills.py`, and register the supplier hold. The total is the backend's sum. The bill-number rule runs on create and update: trim, reject blank, compare `casefold()` against the supplier's own bills. Amounts and their sum stay inside the integer column. The due date defaults to 30 days past the bill date and takes any value. A new bill is unpaid; editing never changes that; the paid and unpaid actions own it. Status is derived once and shared with `stats.py`, with the date edges pinned: due today is unpaid, not overdue.

Tests: `test_bills.py`, the bill cases in `test_who.py`, and the bill case in `test_holds.py`.

Done when: `/api/bills` lists, creates, updates, deletes and flips paid and unpaid; a duplicate number for the same supplier is a 400 with a clear message and the same number on another supplier is allowed; a tampered total is ignored; the migration builds the table and row-level security; the focused backend tests are green.

### Phase 2 — Sample data and dashboard figures

Seed the three supplier organizations and their bills over the last twelve months: monthly bills per supplier, occasional large ones, most paid with their days spread across the months, some unpaid and a few overdue, every category used. Extend `stats.py` with the payables block and the spending buckets from `months.py`, all through the shared status helper. Update the seed, migration, reset, dashboard, hold and search expectations for the new table and its rows.

Tests: `test_seed.py`, `test_migrations.py`, `test_reset.py`, `test_dashboard.py` and the search case.

Done when: a fresh database and `npm run seed` both show the supplier bills; `/api/dashboard`'s three figures match the unpaid bills behind them and its spending matches the paid bills by paid month and category; those tests are green.

### Phase 3 — Frontend bills area

Add the client types and calls, `lib/bills.ts` and the chart helper, then replace `BillsTab.tsx` and add `BillForm.tsx`: the table with its status filter and search, the dialog with the due date following the bill date until changed by hand, the total preview and the attribution line, and Mark paid and Mark unpaid as row actions that move the list at once. Add the read-only `OrganizationBills` panel and hand it to the organization page through `ORGANIZATION_PANELS`. Build the dashboard's Money section below the sales charts: the three figures, the due timeline and the stacked spending chart in the six category colors. Category dots in `brand.css` on existing tokens.

Tests: `BillsTab.test.tsx`, `BillForm.test.tsx`, `OrganizationBills.test.tsx`, `Dashboard.test.tsx`, `lib/bills.test.ts`, `charts.test.ts`, `client.extra.test.ts` and the route tests.

Done when: a bill can be added, edited, marked paid and marked unpaid again in the browser; the tab, the organization's panel and the dashboard move together after each change; the focused frontend tests are green.

### Phase 4 — End-to-end

Write `bills.spec.ts` and extend `dashboard.spec.ts`, `startup.spec.ts` and `security.spec.ts`. Every test signs in through the local teammate screen, resets its own sample data, and watches the console.

Done when: the bills intent criteria hold in a real browser, the existing e2e suite still passes, and no console errors appear.

### Phase 5 — Build

Run `npm run check` and fix every gate: Prettier, ESLint (complexity at most 15), ruff format and ruff check (C901 at most 15), `tsc`, `ty`, gitleaks and `npm test` with coverage of at least 80%. Reseed the local sample database with `npm run seed`, because the migration creates an empty bills table on an existing database, and make one pass through `/money/bills`, an organization with bills and the dashboard's Money section. Update `README.md` and `docs/STATUS.md` with the exact run results.

Done when: `npm run check` exits 0, the local sample database shows the supplier bills and the status record is current. This is where the plan stops; ui-check, the review and `docs/IMPROVE.md` follow.

## Risks

1. **Status is derived, and the day turns without a save.** An unpaid bill flips to overdue at midnight with nothing written. Keep one derivation (paid when `paid_date` is set, overdue when unpaid and `due_date` is before today, else unpaid) used by the list filter, the organization's panel and the dashboard, so the three can never disagree; the server computes it and the browser shows what it is given. The date columns are plain dates compared with one plain `today`, the same convention `stats.py` already uses for follow-ups, and every test passes a fixed date rather than trusting the wall clock. The edges are pinned: a bill due today is unpaid and sits in the 30-day figure, and a bill due exactly 30 days out is the timeline's last row.
2. **Bill-number uniqueness must answer the same on SQLite and Postgres.** A database unique index would behave differently, so compare `casefold()` in Python over the supplier's own bills on create and update, as the product name rule does. Test case and whitespace variants, the same number on another supplier (allowed), and direct API calls. Two simultaneous inserts can still race — acceptable for a small team.
3. **`total_cents` is the backend's alone.** `BillIn` carries no total and a payload that smuggles one is ignored; a test proves the stored total stays the sum even when the client sends another. Validate the sum against the integer column's range as well as the parts, or Postgres raises where SQLite shrugs.
4. **The list and the dashboard must agree.** "Bills to pay" covers the Unpaid and Overdue views together, "Overdue" is the Overdue view, and the 30-day figure is the bills under the timeline. Define the figures once in `stats.py` from the shared status helper and have `dashboard.spec.ts` recompute them from `/api/bills` instead of trusting hard-coded numbers. A paid bill is in none of the three and in no bar of the spending chart.
5. **The seed must stay cheap.** The intent wants twelve months of bills, and the one-second test cap is a hard constraint on CI's slow machine. Keep the seed at a few dozen rows — monthly bills plus a handful of large ones — and keep `test_seed.py` on the existing fast-insert pattern; no generated hundreds.
6. **The changes to shared screens are additive but real.** The dashboard gains a section and the organization page a panel; `DataTable`, `SearchBox` and `Money.tsx` are untouched, and the existing suites must stay green. The category colors obey the one-place rule: no color literals in TypeScript, only `var(--color-...)` references as `charts.ts` already makes, and Other on the quiet ink-muted tone rather than a sixth color. `colors.test.ts` keeps passing in both modes.
7. **Area boundaries hold under the new data.** The dashboard's Money section reads only its own `/api/dashboard` route; `pages/money/` and `Dashboard.tsx` never import each other, and the six categories live in `frontend/src/lib/` above both. The organization's bills panel is read-only and arrives through the shared slot, so `Organization.tsx` never names bills.

## Proof

### Unit — backend (pytest, `backend/tests/`)

- `test_bills.py` — create, read, update, list and delete; a supplier that does not exist is refused; the reply's total is amount plus tax and a payload's own total is ignored; negative amounts and tax refused, and a sum past the integer column refused; the due date defaults to 30 days past the bill date and any date is accepted; the bill number is trimmed, required, and `PRIORITY SUPPORT`-style case and whitespace variants of the same supplier's number refused on create and update while another supplier may use the same number; status is unpaid, due today is unpaid not overdue, a past due date is overdue and a paid bill is never overdue; the status filter's Unpaid, Overdue and Paid views divide every bill; `q` matches the supplier's name and the bill number ignoring case; sort by supplier, bill number, dates and total; the supplier filter returns one organization's bills; marking paid records today or the day given, marking unpaid clears it, and an edit never changes either; a delete always goes through; deleting an organization with bills is refused with 409 naming them.
- `test_who.py` — a bill added by one teammate carries both emails; another's edit moves only the last-changed one; a no-op save leaves it; the paid and unpaid actions stamp the last-changed one; the bill's reply carries both.
- `test_dashboard.py` — Bills to pay is the total and count of every unpaid bill; Overdue and the 30-day figure count only unpaid bills in their windows, with a bill due today in the 30-day figure and one 30 days out at its edge; the timeline rows are those bills soonest first with supplier, due date and total; spending counts each paid bill's total in its paid month per category over the 12 buckets, a bill paid on a month's last day in that month, and unpaid bills in no figure and no bar.
- `test_holds.py` — a real bill holds its supplier: the organization's delete is refused 409 "This organization has 2 bills, so it can't be deleted.", one bill reads "1 bill", and an organization with no bills still cascades.
- `test_seed.py` — the schema's tables include bills; three supplier organizations join the sample; every one of the last twelve months has paid bills; unpaid and overdue bills both exist; every category appears; every bill is attributed to a teammate; the API serves bills; reseeding is idempotent.
- `test_migrations.py` — migrated and metadata schemas match for bills; a pre-change database upgrades to `0006`, keeps its rows and gains an empty bills table; Postgres offline SQL creates bills with the supplier foreign key and enables row-level security.
- `test_reset.py` — reset rebuilds the bills and leaves version `0006` with the schema agreeing.
- `test_search.py` — a bill number and a supplier name find no top-bar match; the four kinds' cases still pass.
- `test_every_route.py` — automatically picks up the bill routes and proves each refuses without a signature; no edit expected.

### Unit — frontend (Vitest, `frontend/src/**/*.test.ts(x)`)

- `pages/money/BillsTab.test.tsx` — the columns and their dashes; totals in the mono money style; each category shows its dot beside its name; Unpaid, Overdue and Paid badges and the paid date on paid rows; the status filter's three views divide the rows and everything shows in front of them; search by supplier name and by bill number; Mark paid and Mark unpaid call the API and flip the row at once; Edit opens the form; Delete asks first and removes the row; a failed action leaves the row and shows a message; loading, error and empty states.
- `pages/money/BillForm.test.tsx` — Add starts with the due date 30 days after the bill date and keeps moving it as the bill date changes until the due date is edited by hand; the supplier is chosen from the organizations; amounts and tax parse to cents and the total previews as their sum; the category list is the fixed six; Edit pre-fills every field and shows who added the bill and who last changed it; a duplicate bill number shows the API's message; a save sends the trimmed number, no total and no paid date; a failed save keeps the dialog open on its values.
- `pages/money/OrganizationBills.test.tsx` — the panel lists the record's bills with number, due date, total and status; it offers no actions; it asks for that organization's bills only; its empty state shows when the supplier has none.
- `pages/Dashboard.test.tsx` — the three figures with their counts; the timeline rows soonest first and its nothing-due line; the stacked bars hold one segment per category in the same six keys the legend shows; the section sits below the sales charts; a changed payload moves the figures.
- `lib/bills.test.ts` — the six categories in order with their colors, Other on ink-muted; the status tone map (Unpaid info, Overdue negative, Paid positive); the derived status's day edges.
- `lib/charts.test.ts` — the spending-bars helper builds the 12 months, keeps zero months, and splits a month by category.
- `api/client.extra.test.ts` — the bills calls use the right methods and paths: list with its query, create, update, delete, paid with a day and unpaid with none; the dashboard payload's payables block is typed and passed through.
- `routes.test.tsx`, `routes.extra.test.tsx` — the mocked API gains bills; the organization page renders its bills panel; the sections and routes are unchanged elsewhere.

### End-to-end (Playwright, `e2e/`)

- `bills.spec.ts` — `/money/bills` opens on the sample bills with their statuses, category dots and dollar totals; the Unpaid, Overdue and Paid views divide them and the sample overdue bill reads Overdue; search by a supplier's name and by a bill number; add a bill — its due date arrives 30 days out and its total shows once saved — and see it in the list and on its organization's page; edit it; mark it paid and watch the badge and paid date arrive, then mark it unpaid again and watch them go; delete one behind the confirm dialog; adding `PRIORITY SUPPORT` beside a supplier's existing number shows the API's message in the form, the same call through the API is refused, and another supplier may use the number; a second teammate changes a bill through the API and the dialog credits both emails; a reload keeps everything; `npm run seed` brings the sample bills back. No console errors.
- `dashboard.spec.ts` — the Money section's three figures and counts match the bills computed from `/api/bills`; the timeline lists the bills due in the next 30 days soonest first and the 30-day figure covers exactly its rows; the spending chart shows 12 stacked bars with the category legend; marking a bill paid moves the figures and its month's bar at once; the sample overdue bill is counted in Overdue.
- `startup.spec.ts` — `/money/bills` shows the sample bills and `/api/bills` answers alongside the other sections.
- `security.spec.ts` — `/api/bills` refuses without a token and answers signed in.

### Intent criteria

1. `npm run check` passes — the Build phase.
2. A bill can be added, edited, marked paid and marked unpaid again — `test_bills.py`, `BillsTab.test.tsx` and `bills.spec.ts`.
3. The dashboard's figures match the unpaid bills and the spending chart matches the paid bills by paid month and category — `test_dashboard.py`, `Dashboard.test.tsx` and `dashboard.spec.ts`.
4. A bill number used twice for the same supplier is refused, through the page or the API — `test_bills.py`, `BillForm.test.tsx` and `bills.spec.ts`.
5. An unpaid bill past its due date shows as overdue in the list and on the dashboard — `test_bills.py`, `BillsTab.test.tsx` and `dashboard.spec.ts`.
6. On a fresh copy with the sample data the Bills tab and the dashboard's Money section are full of realistic figures — `test_seed.py`, `test_reset.py`, `startup.spec.ts` and the Build's manual pass.
