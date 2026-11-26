# Plan: quotes

Based on `docs/changes/quotes/intent.md` (the bar) and `docs/spec.md` with `docs/specs/quotes.md`, `money.md`, `deals.md`, `products.md`, `company-settings.md`, `tables.md`, `running.md`, `look-and-feel.md` and `design.md` (the product). No code written yet. The intent wins over the spec and the spec wins over this plan; if the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`. The prepare change already landed the shared machinery this plan builds on: `tax.py` / `lib/tax.ts` with `shared/totals-cases.json`, `documents.py` and `number_counters`, `holds.py`, `RecordPanels`, the Money tabs, `StatusBadge`, `KpiCard` and the wide `Modal` with `.document-editor`.

One new dependency, with the case: **fpdf2** for the PDF. The intent allows one only if it installs with uv and runs on Render's native Python runtime with no system packages; fpdf2 2.9.0 is entirely Python (its only dependencies are Pillow and fontTools, all wheels, no system libraries), it embeds TrueType fonts, and it draws every string as text. The mature alternative, reportlab, ships compiled wheels and is not pure Python; the HTML-to-PDF route (weasyprint) needs system packages, which the constraint rules out. The brand fonts' TTF files join the repo beside the backend code — assets, not dependencies — the same Google Fonts families (SIL Open Font License) the frontend bundles as woff2.

## Files that change

### What the sides agree on

- **Two tables.** `quotes`: id, number, deal_id, status (draft, sent, accepted, declined), created_at, valid_until, tax_label, tax_rate_thousandths, created_by, updated_by. `quote_lines`: id, quote_id, product_id, product_name, description, quantity, unit_price_cents, position. No amount or total columns: every amount is computed with `tax.py`. `tax_label` and `tax_rate_thousandths` are null on a draft and stored at send. `created_at` and `valid_until` are Dates holding the server's local day (the `happened_at` convention); a quote is valid 30 days from its creation day. Lines carry no attribution of their own — a line is part of its document, and the quote's `created_by`/`updated_by` cover it; the spec shows attribution only on the quote.
- **The states.** Stored: draft, sent, accepted, declined. Expired is a view: a sent quote once today is past its valid-until date, counting through its last day (valid until Nov 30 is expired on Dec 1). Every reply carries the displayed status — draft, sent, expired, accepted or declined — so the view is worked out in one place and the stored state never leaves the backend. Actions per state: a draft is edited or sent; a sent or expired quote is accepted, declined, copied or downloaded; an accepted or declined quote is copied or downloaded. Copy is for anything that is no longer a draft.
- **The API.** `GET /api/quotes` (optional `deal_id` or `organization_id` for the panels; the unfiltered call also carries the five totals), `GET /api/quotes/{id}`, `POST /api/quotes` (deal_id, an optional valid_until, lines), `PUT /api/quotes/{id}` (a draft's valid_until and lines), `POST /api/quotes/{id}/send`, `/copy`, `/accept`, `/decline`, and `GET /api/quotes/{id}/pdf`. There is no DELETE route anywhere. Refusals are 400s with a plain sentence in `detail` ("Only a draft can be changed." and friends), 404s come from `read_or_404`, and a held deal or organization keeps the holds' 409.
- **The sums.** The browser sends quantities and unit prices only — never an amount or a total. `tax.py` works out each amount (quantity times unit price), the subtotal, the tax once on the subtotal at the rate rounded to the nearest cent halves up, and the total. The live preview computes the same with `lib/tax.ts`; both sides run `shared/totals-cases.json`. A quantity is 1 to 1,000,000, a unit price is 0 to the integer column's limit (the products bound), and a line amount and the subtotal stay inside the money columns' limit.
- **The lines.** A line snapshots the product's name and unit price as they were when it was added (the name comes from the product row at save time; the price comes from the form, pre-filled with the product's price), and its description starts as the product's and can be changed, as can the quantity and the unit price. Only active products can be added, on create and on update alike; a line already on the quote stays when its product is archived. Lines keep their `position`.
- **The numbers.** Taken at creation and on copy through `documents.take_number` inside the quote's own transaction: no gaps on a failed save, no repeats at the same moment, never reused (there is no delete). The sample data sets `number_counters` to its last number, so a fresh quote after a seed continues the sequence.
- **Accepting.** `backend/app/stages.py` holds the board's move rules — the new stage's default probability, the place at the end of the column, both columns renumbered, and the system `stage_change` timeline entry naming who moved it — extracted from `routes/deals.py` and used by both `POST /deals/{id}/stage` and accept, so the two cannot drift. Accept also sets the deal's value to the quote's subtotal before tax, rounded to the nearest dollar halves up: `(subtotal_cents + 50) // 100` dollars stored as cents. A deal has at most one accepted quote and accepting a second is refused. Accepting works on a sent or expired quote whatever stage the deal sits in now (a quote is only created on an open deal, but the deal may have been dragged away since), and moves it to Won exactly as a drag would. Declining changes only the quote.
- **The customer and the company.** The document's customer is read live from the deal — its organization and, when it has one, its main contact — and the company block live from Settings. Only the lines and the tax freeze at send.
- **The five totals.** Draft, Sent, Expired, Accepted and Declined across the top of the Quotes tab, each the total including tax of the quotes in the state they show, each quote counted once. A draft's total follows the settings' rate now; a sent, expired, accepted or declined quote follows the rate it kept when it was sent. The figures come on `GET /api/quotes` so the page shows what the server worked out. The list columns: number, deal and organization, state, valid-until date and total including tax. There is no New quote action on the tab; the rows open the quote.
- **The PDF.** `GET /api/quotes/{id}/pdf` for any quote that is not a draft, made at download from the quote's saved values through `backend/app/quote_pdf.py` and fpdf2, returned as `application/pdf` named `QT-0001.pdf`. US Letter, white page with Midnight ink and a Sea Green accent in both app themes (the customer's paper): Instrument Serif for the title, Instrument Sans for the text, JetBrains Mono for the number and every amount, money always with its currency and two decimals. The sections follow `QuoteDocument.tsx` in the same order: the company's details, the customer, the number and the dates, the lines, the subtotal, the tax with its label and rate, the total. Anything typed is drawn as text: fpdf2's optional `**bold**` / `__italics__` markup is turned off (`markdown=False`) on every text call, so nothing typed is ever interpreted.
- **The page and the preview.** A quote is created and edited in the wide dialog — the form beside the live preview (`Modal` `wide` and `.document-editor`) — and the preview and the quote page share `QuoteDocument.tsx`. The quote page at `/money/quotes/:id` shows the document, the actions its state allows (Send, Accept, Decline, Copy, Download PDF), and who added it and who last changed it as their email. `QuotesTab.tsx` owns the sub-routes under `quotes/*`: the list at `/money/quotes`, the quote page at `/money/quotes/:id`.
- **The panels.** The deal's panel lists its quotes — number, state, valid-until date and total — and offers New quote while the deal is in New, Qualified, Proposal or Negotiation; a Won or Lost deal keeps its quotes and takes no new ones. The organization's panel lists the quotes of its deals, adding the deal each belongs to. Both panels' rows open the quote. They register in `routes.tsx`'s `DEAL_PANELS` and `ORGANIZATION_PANELS`; neither record page names the area.
- **The sample.** Quotes built from the sample products on the eight open Proposal and Negotiation deals: some drafts, some sent, one or two expired (sent with a valid-until in the past) and one declined. Every won deal of the last three months gets an accepted quote whose subtotal before tax rounds to that deal's value. Sequential numbers, teammate attribution with some quotes last changed by another, and the quote counter set to the last number.
- **Money and dates.** Document money always shows two decimals with its currency (`formatUsdWithCents`); the five totals and the list's totals do too. The deal's value stores the rounded whole dollars as cents. Date tests compare with the clock the value was made from (`date.today()`, the same clock `created_at` uses).

### Backend — new

- `backend/app/routes/quotes.py` — the routes above (the file is a stub waiting for them), and `HOLDS = (Hold(link=quotes.c.deal_id, noun="quote"),)`: one hold covers both the deal and the organization, because the organization delete already passes its deals as targets and `holding()` counts a quote once.
- `backend/app/stages.py` — the stage-move rules extracted from `routes/deals.py`: the default probability, the end-of-column placement, the renumbering of both columns, and the `stage_change` entry with who moved it.
- `backend/app/quote_pdf.py` — `quote_document(...)` building the document as plain rows (company, customer, number and dates, lines, totals) and `render_pdf(document) -> bytes` drawing it with fpdf2 and the three brand TTFs. The seam keeps the proof of what appears on the PDF in one place.
- `backend/migrations/versions/0006_quotes.py` — `quotes` and `quote_lines`, row-level security on Postgres; no data (the sample belongs to the seed).
- `backend/fonts/InstrumentSans-Regular.ttf`, `InstrumentSerif-Regular.ttf`, `JetBrainsMono-Regular.ttf` — the brand families, embedded in the PDF (the frontend's woff2 copies cannot be).
- `backend/tests/test_quotes.py` — the API and the rules.
- `backend/tests/test_quote_pdf.py` — the document model and the rendered bytes.

### Backend — edited

- `backend/app/db.py` — the two tables; `_unversioned_revision` returns `0006` for a schema that has them.
- `backend/app/seed.py` — `_quotes` and `_quote_lines` builders from the sample products and deals, their numbers, the `number_counters` row at the last of them, and attribution through `insert_sample`.
- `backend/app/routes/deals.py` — calls `stages.py` instead of its own copy; behaviour unchanged.
- `backend/tests/test_migrations.py` — the exact schema includes both tables; a 0005 database reaches 0006 and keeps its rows; the offline SQL creates both and enables RLS.
- `backend/tests/test_seed.py` — the tables and columns, the states spread, the accepted quotes matching their deals' values, the numbers and the counter, the idempotent counts.
- `backend/tests/test_reset.py` — the counts and version `0006` after a reset.
- `backend/tests/test_holds.py` — a deal with quotes refused with the count, and an organization held through the quotes on its deals.
- `backend/tests/test_who.py` — who adds a quote, who last changed it and the no-op save.
- `backend/tests/test_stage_move.py` — its cases through `stages.py`, plus accept's move matching a drag to Won.
- `backend/tests/test_built_app.py` — `/money/quotes/1` is served the built page.
- `pyproject.toml`, `uv.lock` — `uv add fpdf2`.

### Frontend — new

- `frontend/src/api/quotes.ts` — `Quote`, `QuoteLine`, `QuoteInput` and the list reply (rows plus the five totals) as types, and `list`, `get`, `create`, `update`, `send`, `copy`, `accept`, `decline` and the PDF request on the helpers `api/client.ts` exports.
- `frontend/src/api/quotes.test.ts` — each call's path, method and body; the PDF's.
- `frontend/src/components/QuoteDocument.tsx` — the customer's document: the white page with Midnight ink and a Sea Green accent in both themes, the company and customer blocks, the number and dates, the lines, the subtotal, the tax with its label and rate, the total; mono money with two decimals; every typed string rendered as text.
- `frontend/src/components/QuoteDocument.test.tsx`.
- `frontend/src/components/QuoteForm.tsx` — the wide dialog's form: the active products, line rows (name, description, quantity, unit price, amount), add and remove a line, the valid-until date, live totals from `lib/tax.ts` beside the preview, the save payload carrying quantities and unit prices only, and the messages on the form's error line. It is keyed so a saved reply repopulates it, like the settings form.
- `frontend/src/components/QuoteForm.test.tsx`.
- `frontend/src/components/QuotePanels.tsx` — `DealQuotesPanel` and `OrganizationQuotesPanel` for `RecordPanels`, with a local New quote dialog on the deal panel.
- `frontend/src/components/QuotePanels.test.tsx`.
- `frontend/src/pages/money/Quote.tsx` — the quote page: the document, the actions per state, the attribution line, and the edit dialog for a draft. Everything keyed on the route's id, so navigating to another quote on the same route refetches (the URL-state trap from the MVP and the products link).
- `frontend/src/pages/money/Quote.test.tsx`.

### Frontend — edited

- `frontend/src/pages/money/QuotesTab.tsx` — replaces the placeholder: its own sub-routes (the list, then `:id` for `Quote.tsx`), the five totals across the top, the list of every quote with no add, edit or delete, rows opening the quote.
- `frontend/src/pages/money/QuotesTab.test.tsx` — new; the stub has none: the totals, the rows and their displayed states, the sub-routes.
- `frontend/src/routes.tsx` — `DEAL_PANELS` and `ORGANIZATION_PANELS` gain the two quotes panels; the `quotes/*` route already belongs to the tab.
- `frontend/src/routes.test.tsx`, `frontend/src/routes.extra.test.tsx` — the shared `api` mock gains quotes; the quote page joins the route sweeps and the signed-out check; the panels show on the deal and organization pages.
- `frontend/src/styles/brand.css` — the document styles from tokens (`.quote-document` and its parts), with the document's three colors as tokens fixed in both themes — the paper is the customer's, so dark mode keeps it white. `colors.test.ts` learns the exception so its "dark re-points every token" rule does not fight `look-and-feel.md`.

### End-to-end

- `e2e/quotes.spec.ts` — new: the walk below.
- `e2e/security.spec.ts` — `/api/quotes` joins the routes that refuse without a token.
- `e2e/menu.spec.ts` — the quote page joins the theme sweep: the chrome follows the mode, the document stays white.

### Docs

- `docs/STATUS.md` — what lands in each phase and the final check result.
- `docs/specs/design.md` — the shared-code list names `stages.py` and `quote_pdf.py`, and the quote PDF's brand fonts as TTFs beside the code; anything else the build corrects.
- `docs/changes/quotes/plan.md` — only if the plan itself changes.

### Untouched

- `backend/app/tax.py`, `documents.py`, `holds.py`, `months.py`, `records.py` — reused as they are.
- `backend/app/main.py` — the quotes router and its holds are already registered.
- `backend/tests/test_tax.py`, `test_documents.py`, `test_every_route.py` — unchanged; the route sweep picks up the new routes in both copies, and `test_documents.py` already proves a failed save rolls its number back.
- `frontend/src/lib/tax.ts`, `money.ts`, `settings.ts`, `shared/totals-cases.json` — reused.
- `frontend/src/pages/Money.tsx`, `pages/money/InvoicesTab.tsx`, `BillsTab.tsx` — the tab strip and the two placeholders stay as they are.
- `frontend/src/components/Modal.tsx`, `StatusBadge.tsx`, `KpiCard.tsx`, `RecordPanels.tsx`, `DataTable.tsx` — reused (the wide modal, the document badge tones, the five totals; the Quotes list is its own table because a quote has no add, edit or delete on a row).
- `package.json`, `scripts/`, `e2e/helpers.ts` — no new scripts; the reset, sign-in and guards are reused.

## Order of work

### Phase 1 — Schema and the sample data

1. Add `quotes` and `quote_lines` to `backend/app/db.py`; `_unversioned_revision` returns 0006 for a schema with them.
2. Add `0006_quotes.py` with the tables and, on Postgres, row-level security.
3. Add the quote and line builders to `backend/app/seed.py`: the quotes on the open Proposal and Negotiation deals and the accepted ones on the recent won deals, sequential numbers, attribution, and the `number_counters` row at the last number.
4. Update `test_migrations.py`, `test_seed.py` and `test_reset.py`.

Done when: the migration, seed and reset tests pass; a 0005 database with records gains the two tables and the sample quotes; a fresh seed numbers its quotes from QT-0001 with no gaps and a quote created through the API takes the number after them; every won deal of the last three months has its accepted quote.

### Phase 2 — The API and the PDF

1. Extract `backend/app/stages.py` from `routes/deals.py` and point the drag endpoint at it; `test_stage_move.py` keeps passing.
2. Build `backend/app/routes/quotes.py`: the list with the five totals, one quote, create on an open deal (the number inside the transaction), update a draft, and the send, copy, accept and decline actions; fill in `HOLDS`.
3. Add the three TTFs and `uv add fpdf2`; write `backend/app/quote_pdf.py` and the PDF route for non-drafts.
4. Add `test_quotes.py` and `test_quote_pdf.py`; extend `test_holds.py`, `test_who.py` and `test_stage_move.py`; the route sweep picks up both copies.

Done when: the backend suite passes; a sent quote refuses every change through the API with a plain message; accepting moves the deal exactly as a drag to Won does and the timeline names who; the PDF renders with the three brand fonts and carries the typed-text test.

### Phase 3 — The pages and the preview

1. Add `frontend/src/api/quotes.ts` and its test.
2. Add `components/QuoteDocument.tsx` and its test: the document in both themes, white paper, mono money.
3. Add `components/QuoteForm.tsx` and its test: the lines, the live totals, the save payload, the errors.
4. Add `components/QuotePanels.tsx`, register both panels in `routes.tsx`, and add the tests.
5. Replace `pages/money/QuotesTab.tsx` and add `pages/money/Quote.tsx` with their tests; add the document styles to `brand.css`.
6. Run `npm run dev` and walk it: create a quote from a deal, adjust its lines, watch the preview add up, save, edit, send and download the PDF beside the preview.

Done when: the Vitest suites pass; a three-line quote adds up the same in the preview, the saved quote and the API's reply; only a draft is editable on screen.

### Phase 4 — Build

1. Add `e2e/quotes.spec.ts`; extend `e2e/security.spec.ts` and `e2e/menu.spec.ts`.
2. Run `npm run check`.
3. Walk criteria 2–8 in the browser: the three-line totals on screen and on the downloaded PDF, a sent quote refused through the page and the API, the accepted quote winning its deal with the timeline naming who, the expired quote in its total and still accepted, the fresh-seed screens, and the delete route that does not exist. Open the PDF beside the preview and check they match. Time every unit test, old and new: each stays under a second.
4. Update `docs/STATUS.md` with the result and any spec correction the build needed.

Done when: `npm run check` passes, including the new backend, frontend and end-to-end tests, and the eight criteria hold. ui-check, the reviewer and `docs/IMPROVE.md` come after this plan, not inside it.

## Risks

Most damaging first.

1. **A number repeats or a gap opens.** Taken outside the save transaction, or seeded without moving the counter, and QT-0007 is issued twice after a reset or a failed save leaves a hole. Mitigation: `documents.take_number` runs inside the quote's own `begin()` block (already proved to roll back), the seed writes `number_counters` at its last number, and the tests create a quote after a seed and after a failed save and read the numbers. Phase 1 and 2.
2. **A sent quote changes anyway.** An update path, an action or a later settings save rewrites what sending froze, breaking criterion 3. Mitigation: the update route refuses anything but a draft, send stamps the tax label and rate and nothing after send writes the row's content, and the tests change the settings after sending and PUT a sent quote and check the stored row byte for byte. Phase 2 and 4.
3. **Accepting drifts from the board move.** Two copies of the move rules would mean no timeline entry, a wrong position or a missing probability reset on accept. Mitigation: one `stages.py` behind both, and a parity test asserting accept's move equals a drag to Won, entry and position included. Phase 2.
4. **The deal's value is rounded wrong.** Float maths or banker's rounding turns a $100.50 subtotal into $100. Mitigation: integer halves up, `(subtotal_cents + 50) // 100`, with tests at .49, .50 and .51. Phase 2.
5. **The totals disagree across preview, page and PDF.** The browser computing its own sums would drift from what is saved and printed (criterion 2). Mitigation: the backend owns every amount through `tax.py`, the input carries no totals, the preview uses `lib/tax.ts` and both run `shared/totals-cases.json`; the same three-line quote is asserted in the API test, the document-model test and the form's preview test. Phase 2 and 3.
6. **Typed text becomes markup on the PDF.** fpdf2 reads `**bold**` and `__italics__` as styling by default, so a customer note could print bold or with its markers eaten. Mitigation: `markdown=False` on every text call in `render_pdf`, and the tests feed `**bold**`, `<b>x</b>`, underscores and a long unbroken string through the model and the route. Phase 2.
7. **The five totals or the expired view are wrong.** Off-by-one expiry (a quote expiring on its last day rather than the day after), a quote counted in two totals, or a draft totalled at its frozen-at-creation rate instead of the settings' current one — criterion 7 rides on this. Mitigation: one displayed-state function behind the rows and the totals, boundary tests on the last day and the day after, and a mixed-list test checking each quote counts once. Phase 2 and 3.
8. **The PDF and the preview drift apart.** They are two layouts — HTML/CSS and fpdf2 — that must look the same (criterion 5). Mitigation: `quote_document` mirrors `QuoteDocument.tsx` section for section in the same order, the Phase 4 walk opens the downloaded PDF beside the preview, and ui-check comes after this plan. Phase 2, 3 and 4.
9. **The dependency or the fonts fail where it runs.** fpdf2 or its TTFs must work on Render's native runtime and in the test environment alike. Mitigation: pure-Python wheels with no system packages, `uv sync` unchanged on Render, the TTFs shipped as repo files, and the render test asserting the three family names appear in the PDF's bytes. Phase 2.
10. **The document's colors fight the theme test.** The paper stays white in dark mode on purpose, but `colors.test.ts` requires every token to be re-pointed in the dark block. Mitigation: the document's colors are their own fixed tokens with the test taught the exception, so neither rule is weakened silently. Phase 3.
11. **A deal or an organization is deleted under a quote.** Missing or narrow holds would leave a document pointing at nothing (tables.md decision 11). Mitigation: `HOLDS` on the quotes router, the organization covered through its deals' targets, and `test_holds.py` refusing both deletes with the counts. Phase 2.
12. **The sample data is thin or inconsistent.** An accepted quote whose subtotal does not round to its deal's value, or a counter left at zero so the next real quote collides with QT-0001 (criterion 6). Mitigation: the seed composes lines from the sample products to hit each value, sets the counter, and `test_seed.py` asserts the states spread, the accepted values and the continuity. Phase 1.
13. **The quote page or the dialog repeats the URL-state trap.** A query parameter or a route id seeded once leaves the same page stale when the location changes on the same route. Mitigation: the quote page keys its query and its state on the route's id, the New quote dialog is plain state with no query parameter, and the tests open two quotes one after the other on the same route. Phase 3 and 4.
14. **Coverage or the one-second rule slips.** The new modules must clear 80% and PDF rendering in unit tests must stay fast. Mitigation: the tests above cover every route and component path, the PDFs in tests are one page with three lines, and the Phase 4 walk times the slowest unit test.

## Proof

`npm run check` runs everything below and fails if any of it fails. The eight criteria map to the tests that prove them:

1. **`npm run check` passes.** The whole suite, including the new backend, frontend and end-to-end tests.
2. **Three lines add up exactly, in the app and on the PDF.** `test_quotes.py` for the API's sums, `test_quote_pdf.py` for the document model's amounts, subtotal, tax and total, `QuoteForm.test.tsx` for the live preview, `quotes.spec.ts` for the saved quote on screen.
3. **A sent quote can't be changed.** `test_quotes.py` (PUT and the actions refused), `Quote.test.tsx` (no edit offered), `quotes.spec.ts` (through the page and the API).
4. **Accepting moves the deal.** `test_quotes.py` and `test_stage_move.py` (the move, the value and the entry naming who), `Quote.test.tsx`, `quotes.spec.ts`.
5. **The PDF downloads and shows the details.** `test_quote_pdf.py` (the model and the rendered bytes), `quotes.spec.ts` (the download, its type and name), and the Phase 4 walk opening it beside the preview.
6. **A fresh copy is full of realistic quotes.** `test_seed.py`, `test_reset.py`, `quotes.spec.ts` on the sample data.
7. **Expired shows, can be answered, and counts as Expired.** `test_quotes.py` (the boundary and the totals), `QuotesTab.test.tsx`, `quotes.spec.ts`.
8. **No delete and no reused numbers.** `test_quotes.py` (DELETE answered 405, numbers through the transaction), `test_documents.py` (unchanged, the rollback), `test_seed.py` (the counter), `quotes.spec.ts`.

### Unit — backend (pytest)

- `test_quotes.py` — create on an open deal: the number, a valid-until 30 days out, the tax label and rate from the settings, the sums from `tax.py`; create refused on a Won deal, a Lost deal, a missing deal and an archived product; two creates take consecutive numbers and a rolled-back create leaves no gap; a draft's update (lines added, changed and reordered, removed; the valid-until date; the product's name and price kept when the product is later renamed or repriced; a line kept when its product is archived); every update, send, accept and decline refused on the wrong state with a plain 400 and no change stored (criterion 3); the line bounds (a quantity of 0 and of 1,000,001, a negative price, an amount past the money column); send storing the label and rate, then a settings save moving the draft's totals and leaving the sent quote's alone; expired shown once today is past the date and not on its last day; accept moving the deal to Won (probability 100, the end of the Won column, the `stage_change` entry naming who) and setting the value to the subtotal before tax rounded halves up, the $100.50 case among them; a second accept refused while the first stands; accept on an expired quote; decline changing only the quote; copy (a new number, the same lines, a fresh 30-day validity, the original untouched, from accepted and declined alike); the five totals over a mixed list, drafts at the settings' rate and the rest at their frozen one, each quote counted once; `DELETE /api/quotes/{id}` answered 405.
- `test_quote_pdf.py` — the document model: the company's details from the settings, the customer with the deal's organization and main contact, the number and both dates, three lines with name, description, quantity, unit price and amount, the subtotal, the tax with its label and rate, and the total; typed `**markup**`, `<b>x</b>`, underscores and a long unbroken string carried through as plain text; the rendered bytes: a PDF with the page count and the three brand families embedded; the PDF route refusing a draft.
- `test_holds.py` — a deal with quotes refused with the count, and an organization held through the quotes on its deals.
- `test_who.py` — who adds a quote, who last changed it after an edit, and a no-op save leaving both.
- `test_stage_move.py` — the existing cases through `stages.py`, and accept's move matching a drag to Won entry for entry.
- `test_seed.py` — the two tables and their exact columns; the states spread across the open deals (drafts, sent, one or two expired, one declined); an accepted quote on every won deal of the last three months whose subtotal rounds to its value; sequential numbers with the counter at the last; re-seeding keeps the counts.
- `test_migrations.py` — the schema matches exactly; a 0005 database reaches 0006 and keeps its rows; the Postgres SQL creates both tables and enables RLS on them.
- `test_reset.py` — a reset restores the sample quotes and leaves the version at 0006 with the counter cleared to the sample's last number.
- `test_built_app.py` — `/money/quotes/1` is served the built page.
- `test_documents.py`, `test_tax.py`, `test_every_route.py` — no change; the sweep now covers the quote routes in both copies.

### Unit — frontend (Vitest)

- `api/quotes.test.ts` — each call's path, method and body; the PDF request; the replies typed.
- `components/QuoteDocument.test.tsx` — the company and customer blocks, the number and both dates, each line's name, description, quantity, unit price and amount, the subtotal, the tax line with its label and rate, the total; money with two decimals and its currency; typed `<b>x</b>` shown literally; the page white in dark mode as well as light.
- `components/QuoteForm.test.tsx` — only active products offered; a line added and removed; quantity and price edits moving the amounts and the totals live through `lib/tax.ts`; the valid-until default and change; the save payload carrying quantities and unit prices and no totals; the saving state; a refused save showing the server's message; the client-side bounds on the form's error line; the preview beside the form showing the same totals.
- `components/QuotePanels.test.tsx` — the deal's rows (number, state, valid-until, total) with New quote on an open deal only; the organization's rows adding the deal; both panels' rows navigating to the quote.
- `pages/money/QuotesTab.test.tsx` — the five totals including tax; the rows and their displayed states, expired among them; a row opening the quote; no New quote action.
- `pages/money/Quote.test.tsx` — the document, the totals and the attribution line; the actions per state (Send on a draft; Accept, Decline, Copy and Download PDF on a sent quote; Copy and Download PDF on accepted and declined; editing only a draft); a failing action showing its message; the edit dialog saving and repopulating; opening a second quote on the same route.
- `routes.test.tsx`, `routes.extra.test.tsx` — the `api` mock gains quotes; the quote page joins the signed-in sweep and the signed-out check; the deal and organization pages render their quotes panels.

### End-to-end (Playwright, `e2e/`)

- `quotes.spec.ts` — on the sample data: the Quotes tab shows the five totals and the seeded quotes; a draft opens with Brightloop's details and its lines; New quote from a deal (pick products, set quantities, change a description and a price, watch the preview add up, save) appears in the deal's panel and the Quotes list; editing the draft moves its totals; the product's later price change leaves the quote alone; Send freezes it — the page offers no edit and the API's PUT answers 400; Accept moves the deal to Won with the quote's value and the timeline entry naming Alex; a second accept is refused; an expired quote shows as expired, counts in the Expired total and can still be accepted or declined; Copy makes a new draft with a new number while the original stands; the PDF is refused on a draft and downloads for a sent quote as a PDF named for its number; `DELETE /api/quotes/{id}` is answered 405 and the numbers carry on after the seed's; no console errors.
- `security.spec.ts` — `/api/quotes` refuses without a token, like the other routes.
- `menu.spec.ts` — the quote page joins the theme sweep: the app chrome follows the mode and the document stays white.
- The existing startup, crud, contacts, pipeline, activities, dashboard, products, search, settings, sign-in and screenshots specs still pass.
