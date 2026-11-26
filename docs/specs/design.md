# Spec: Design

## Architecture

- **Backend** (`backend/`): Python 3.12, FastAPI, SQLAlchemy Core. `npm start` reads `.env` — `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — and runs against Postgres on Supabase; `npm run dev` leaves those settings out and keeps its own database on this computer, so it never reaches Supabase. The sign-in is checked on every request. Row-level security is on for every table, so Supabase's Data API — which the publishable key can reach — serves nothing; the app talks to Postgres directly. Seeds sample data when the database is new. `npm run seed` drops and recreates it, asking for confirmation first.
- Row-level security is on for every table with no policies, deliberately: with nothing allowed through, the Data API returns no rows. Supabase's security advisor reports `RLS Enabled No Policy` on every table for exactly that reason, and writing a policy there would open the Data API up rather than close a hole. The tables are owned by `postgres`, and a table's owner is not subject to row-level security, so the app's own queries are unaffected.
- **Frontend** (`frontend/`): React + Vite + TypeScript, talks to the backend JSON API. In Supabase mode the browser holds only the publishable key; signed out, every route shows the sign-in screen.
- **Shared code** lives above the areas on both sides. On the backend, `backend/app/records.py` holds `read_or_404` (one row, or a 404 naming the record), `require_exists` (a link to a missing record is a 400), `stamp_created` (an add records who added it and who last changed it) and `stamp_updated` (a save records who last changed it only when a stored value actually differs); `tax.py` works out a line's amount, the subtotal, the tax and the total; `documents.py` reads the company settings and gives a quote or an invoice its next number; `holds.py` refuses to delete a deal or an organization while another area's records point at it; and `months.py` gives every monthly chart the same 12 buckets. The routers in `backend/app/routes/` keep only their own area's schema and rules. On the frontend, shared UI lives in `frontend/src/components/`: the forms (`DealForm`, `ContactForm`, `OrganizationForm`, `ProductForm`, and `ActivityForm` inside `Timeline.tsx`), `DataTable`, the dialogs, `KpiCard`, `StatusBadge`, `RecordAttribution` and `RecordPanels`; generic helpers live in `frontend/src/lib/`, including `tax.ts`'s copy of the document sums for the live preview; `frontend/src/pages/` holds only each area's own pages, with `pages/money/` holding the three tabs' pages.
- **Commands** (root `package.json`): `npm run dev`, `npm start` (builds the frontend and runs the app the way Render does), `npm test`, `npm run seed`. Tests: Vitest (frontend), pytest (backend), Playwright in `e2e/` on installed Chrome; tests use their own SQLite databases, each end-to-end run takes ports no other run is using, and no more than two test runs go at once on this computer — the rest wait their turn and say so — so `npm run check` can run in three worktrees at once. The end-to-end tests sign in without anyone's real password and never touch Supabase, so CI needs no secrets.
- **Deployment**: Render's free plan as one web service — FastAPI serves the built frontend and the API, migrations run when it starts. Described by `render.yaml`, with the Supabase settings entered in Render, not written in the file; see [Running it](running.md).

## Data model

| Table | Fields |
|---|---|
| organizations | id, name, website, industry, notes |
| contacts | id, name, email, phone, job_title, organization_id, status |
| deals | id, name, organization_id, contact_id, stage, value_cents, probability, close_date, position |
| activities | id, type (note, call, email, stage_change), contact_id?, deal_id?, description, happened_at, follow_up_date?, done |
| products | id, name, description, price_cents, active |
| company_settings | id, name, address, email, phone, tax_label, tax_rate_thousandths, payment_terms_days, quote_prefix, invoice_prefix, updated_by, updated_at |
| number_counters | id, kind (quote or invoice), last_number |

- Every record table also records who added the row and who last changed it: `created_by` and `updated_by`, holding the signed-in user's email as it comes from the checked token. Both show on the record's detail page, or in the Products table, which has no detail page.
- `company_settings` holds one row for the team, with `updated_by` and `updated_at` for who last changed it and when. The tax rate is stored as an integer number of thousandths of a percent (`tax_rate_thousandths`), so 8.875% is 8875; payment terms are whole days.
- `number_counters` holds one row for each kind of document that has taken a number, added when it takes its first. Quotes and invoices count apart, and a reset clears the rows so each count starts at 1.
- Exactly one of `contact_id` / `deal_id` is set; `stage_change` rows are system-generated (read-only), written automatically when a deal's stage changes, e.g. "Moved from Proposal to Negotiation".
- Stage probabilities: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. A manual probability persists until the stage changes, then resets to the new stage's default.
- Expected revenue = value × probability, over deals not in Won/Lost.
- Money stored in whole cents (integers) and displayed in US dollars, never as bare cents, such as `$49.50`. Product prices are a whole number of cents, zero or more and no more than 2,147,483,647 — what the integer column stores — shown with two decimals.
- A product's `active` flag is its archive state: new products start active, archiving sets it false and restoring sets it true. A product's name is unique ignoring case across active and archived products; the API enforces that on create and update.

## API (JSON, under `/api`)

- Every route refuses when nobody is signed in; the user behind a request comes from the checked sign-in — the Supabase token the way Render runs, the local sign-in on this computer — never from the request.
- `/organizations`, `/contacts`, `/deals`, `/activities`: list (with `q` search, sort, status/stage filters), create, update, delete (delete returns the counts and names of cascaded records for the confirmation dialog).
- `/settings`: `GET` returns the company settings; `PUT` replaces them, checking every value and recording who changed them and when.
- `/products`: list (with `q` search, sort and a filter for archived products), create, update, archive and restore. Products have no delete route.
- Top-bar search: `GET /api/search?q=` returns organizations, contacts, deals and active products whose name contains the query, ignoring case — the same on SQLite and Postgres. Each match says which kind of record it is and its id, so the app can open it; a product match opens the Products page with that product shown, since products have no detail page. Archived products are left out. The per-table `q` search is unchanged.
- `/dashboard`: aggregated figures for the charts, pipeline totals, recent activity, follow-ups.
- `/deals/{id}/stage`: move a deal (stage + position); returns updated probability and totals.

## Frontend

- Client-side routing to the seven sections, the Settings page, the Money tabs and record detail pages for organizations, contacts and deals (organization: contacts + deals lists; contact/deal: details + timeline newest first); products have no detail page. Signed out, every route shows the sign-in screen.
- **Top bar**: section navigation, the search box, and a menu under your initials with Settings, the theme choice and signing out. Money links to its tabbed page, and later areas add panels to deal and organization pages without those pages naming the area.
- **Settings**: one page with the company details form, a Save button and a line showing who last changed the settings and when; the saved values and the new line show at once.
- **Tables**: TanStack Table for search, sort, filters, pagination-free layout; one shared table component with add/edit modal and delete-confirm dialog; the Products table uses it with Archive and Restore in place of Delete and a Show archived control.
- **Charts**: Recharts — line (revenue won per month), bar (deals won per month), funnel/pipeline visual built from stage bars.
- **Pipeline**: dnd-kit; each column keeps a `position` per card, dropped cards persist their exact slot, totals recompute from the store after each move.
- **State/data**: a small query layer (React Query) caching API responses; every mutation updates the cache so totals and lists move immediately.
