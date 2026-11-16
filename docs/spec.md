# Spec: Accountable

Accountable as it stands today: the problem it solves, what it does and how it is built. This is the description of the product and the authority for what it is. Each change updates it so it describes the product after the change merges, and keeps its own intent and plan in `docs/changes/<branch name>/`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what happened last with a customer or what needs doing next.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it is a complete sales CRM for one person, running on their own computer — a private Salesforce that does the everyday CRM essentials really well. It feels sharp, modern and professional, and is a pleasure to use.

- One salesperson uses it on their own computer every day; the rest of the sales team joins later.
- No other systems are involved.

## Out of scope

Not part of this version: sign-in, user accounts or several users; a layout for phones; AI features; email, calendar or phone integrations; currencies other than US dollars; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data.

## The product

### Five sections

- **Dashboard**, the landing page: how sales are going at a glance. Deals won and revenue won month by month over the last 12 months, the open pipeline and its expected revenue (each deal's value times its probability of close), a sales funnel showing how much value reaches each stage, recent activity, and the follow-ups that are coming up or overdue. It is visually striking, with at least a line chart, a bar chart and a visual of the pipeline.
- **Organizations**: the companies we do business with. Open one to see its contacts and deals — just the lists, no merged timeline; history lives on each contact and deal.
- **Contacts**: the people we deal with, including leads and customers, with a filter by status. Open one to see their organization and a timeline of everything that has happened with them.
- **Deals**: the potential sales, with each one's stage, value and close date. Open one to see its details and its timeline. A deal still open after its expected close date stands out, in the table and on its pipeline card.
- **Pipeline**: the deals as cards on a board, one column per stage. Drag a card to another column to change the deal's stage, or within a column to change its place; a card can be dropped anywhere in a column, and it stays where it was dropped. A new deal can be added straight into a column, at that stage. The board shows the total value and expected revenue of the deals still open, each column shows its own, and the figures change as soon as a card moves.

### Four kinds of record

- **Organization**: a company we do business with. Name, website, industry and notes. An organization has many contacts and many deals.
- **Contact**: a person we deal with. Name, email, phone, job title, the organization they belong to, and a status (lead, qualified or customer). A lead is a contact with the lead status, so there's no separate list of leads.
- **Deal**: a potential sale. Name, the organization and the main contact it is with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars, its probability of close, and its expected or actual close date. Each stage has a usual probability of close, and a deal takes its new stage's probability when it moves; a probability set by hand is kept until the stage changes.
- **Activity**: something that happened, or needs to happen, with a contact or deal. Type (note, call or email), the contact or deal it relates to, a description and when it happened, and optionally a follow-up date and whether it's done.

### Tables

Every table has a search box, columns you can sort by clicking their headings, a way to add a new record, and edit and delete on each row. That's how a new deal, a new lead or a new customer is added. Deleting asks first, and says what will happen to the records linked to the one being deleted. Deletion cascades: deleting an organization deletes its contacts and deals, and deleting a contact or deal deletes its activities — the confirmation lists everything that will go. Search is per table only: each box searches its own records, and there is no global search.

### Activities and follow-ups

From any contact or deal you can log an activity (a note, call or email) and give it a follow-up date. An activity relates to exactly one record — a contact or a deal, never both. A follow-up shows on the dashboard as a task until it's marked done. Activities can be edited and deleted too. When a deal moves to another stage, including Won or Lost, an entry such as "Moved from Proposal to Negotiation" appears in its timeline and in the dashboard's recent activity by itself.

### Sample data

Accountable comes with realistic sample data, so every screen looks alive the first time it starts: organizations across several industries, contacts at every status, deals at every stage (including deals won and lost over the past months, deals expected to close in the months ahead and a few running late), and activities with some follow-ups due soon and some overdue.

### Running it

- One documented command starts it, working on Mac, Linux and Windows; it needs no internet connection to use and runs in the latest Chrome or Edge.
- Every change is kept: it's still there after a browser refresh, and every time the app starts it shows every change made before.
- One documented command resets the data to the sample data, to start again from scratch; it asks for confirmation before wiping anything.

### Look and feel

The look follows Accountable's brand guidelines, which take priority over any general design guidance. Light mode by default; a toggle in the top bar switches to dark mode on every page, the app remembers the choice, and it never follows the device's own setting. Designed for a laptop or desktop screen. The copy stays neutral: it doesn't assume the user is the business owner or a hired salesperson.

## Design decisions

Points this spec fixes:

1. **Fonts are bundled, not fetched.** Brand fonts (Instrument Sans, Instrument Serif, JetBrains Mono) come from Google Fonts, but the app must work offline. The font files are bundled locally so the app needs no connection.
2. **Stage probabilities.** Each stage has a usual probability of close: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. They live here; change them here if they feel wrong.
3. **Position within a pipeline column.** A card dropped anywhere in a column keeps its exact slot, so every deal stores a `position`, renumbered on every drop. Refresh behaviour is covered by a test.
4. **Stage changes are system entries, not activities.** Activities have only three types (note, call, email), but a stage change must still appear in timelines and recent activity. It is recorded as a system-generated entry in the same list, read-only.
5. **Dashboard charts.** The dashboard shows a line chart (revenue won per month), a bar chart (deals won per month) and a funnel built from stage bars. The figures must match the data.
6. **The cascade confirmation scrolls.** The delete dialog lists every record and activity that will go; with sample data an organization can take a dozen rows. The dialog scrolls, never truncates the list.
7. **Dark mode meets WCAG AA.** Dark mode text holds 4.5:1 for normal text and 3:1 for large text and UI elements; light mode's contrast is unchanged.

## Design

### Architecture

- **Backend** (`backend/`): Python 3.12, FastAPI, SQLAlchemy Core, SQLite file. Seeds sample data when the database is new. `npm run seed` drops and recreates it, asking for confirmation first.
- **Frontend** (`frontend/`): React + Vite + TypeScript, talks to the backend JSON API.
- **Commands** (root `package.json`): `npm run dev`, `npm test`, `npm run seed`. Tests: Vitest (frontend), pytest (backend), Playwright in `e2e/` on installed Chrome; tests use their own database.

### Data model

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

### API (JSON, under `/api`)

- `/organizations`, `/contacts`, `/deals`, `/activities`: list (with `q` search, sort, status/stage filters), create, update, delete (delete returns the counts and names of cascaded records for the confirmation dialog).
- `/dashboard`: aggregated figures for the charts, pipeline totals, recent activity, follow-ups.
- `/deals/{id}/stage`: move a deal (stage + position); returns updated probability and totals.

### Frontend

- Client-side routing to the five sections plus record detail pages (organization: contacts + deals lists; contact/deal: details + timeline newest first).
- **Tables**: TanStack Table for search, sort, filters, pagination-free layout; one shared table component with add/edit modal and delete-confirm dialog.
- **Charts**: Recharts — line (revenue won per month), bar (deals won per month), funnel/pipeline visual built from stage bars.
- **Pipeline**: dnd-kit; each column keeps a `position` per card, dropped cards persist their exact slot, totals recompute from the store after each move.
- **State/data**: a small query layer (React Query) caching API responses; every mutation updates the cache so totals and lists move immediately.

### Look and feel

Follow the brand skill: Instrument Sans headings/body, Instrument Serif accent, JetBrains Mono for numbers and money. Two modes, one set of color tokens each, no scattered overrides. Light mode, the default — page background `#F0F4F5`, white rounded panels with no outline, Midnight `#073B4C` for ink. Dark mode — page background `#04232E`, black rounded panels with no outline, Sea Mist `#CDD8DB` for ink. Sea Green / Marigold / Coral for three side-by-side things (stages, chart series), Cerulean fourth, Raspberry fifth, in both modes; darken Sea Green and Marigold for small text on light backgrounds and lighten them on dark ones. Dark mode text meets WCAG AA (4.5:1 normal text, 3:1 large text and UI elements). Charts, dialogs and messages follow the mode. No one-edge borders, no gradient fills. Plain, neutral business copy, no exclamation marks. Laptop/desktop layout.
