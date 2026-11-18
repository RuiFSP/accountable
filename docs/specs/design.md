# Spec: Design

## Architecture

- **Backend** (`backend/`): Python 3.12, FastAPI, SQLAlchemy Core, SQLite file. Seeds sample data when the database is new. `npm run seed` drops and recreates it, asking for confirmation first.
- **Frontend** (`frontend/`): React + Vite + TypeScript, talks to the backend JSON API.
- **Commands** (root `package.json`): `npm run dev`, `npm test`, `npm run seed`. Tests: Vitest (frontend), pytest (backend), Playwright in `e2e/` on installed Chrome; tests use their own database.

## Data model

| Table | Fields |
|---|---|
| organizations | id, name, website, industry, notes |
| contacts | id, name, email, phone, job_title, organization_id, status |
| deals | id, name, organization_id, contact_id, stage, value_cents, probability, close_date, position |
| activities | id, type (note, call, email, stage_change), contact_id?, deal_id?, description, happened_at, follow_up_date?, done |

- Exactly one of `contact_id` / `deal_id` is set; `stage_change` rows are system-generated (read-only), written automatically when a deal's stage changes, e.g. "Moved from Proposal to Negotiation".
- Stage probabilities: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. A manual probability persists until the stage changes, then resets to the new stage's default.
- Expected revenue = value × probability, over deals not in Won/Lost.
- Money stored in cents (integers), displayed in US dollars.

## API (JSON, under `/api`)

- `/organizations`, `/contacts`, `/deals`, `/activities`: list (with `q` search, sort, status/stage filters), create, update, delete (delete returns the counts and names of cascaded records for the confirmation dialog).
- `/dashboard`: aggregated figures for the charts, pipeline totals, recent activity, follow-ups.
- `/deals/{id}/stage`: move a deal (stage + position); returns updated probability and totals.

## Frontend

- Client-side routing to the five sections plus record detail pages (organization: contacts + deals lists; contact/deal: details + timeline newest first).
- **Tables**: TanStack Table for search, sort, filters, pagination-free layout; one shared table component with add/edit modal and delete-confirm dialog.
- **Charts**: Recharts — line (revenue won per month), bar (deals won per month), funnel/pipeline visual built from stage bars.
- **Pipeline**: dnd-kit; each column keeps a `position` per card, dropped cards persist their exact slot, totals recompute from the store after each move.
- **State/data**: a small query layer (React Query) caching API responses; every mutation updates the cache so totals and lists move immediately.
