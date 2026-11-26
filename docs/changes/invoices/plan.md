# Plan: invoices and payments

The build of [intent.md](intent.md) against [docs/specs/invoices.md](../../specs/invoices.md) and the area files the Design stage updated. The shared code this change builds on is already in place from `prepare`: `tax.py`, `documents.py`, `holds.py`, `months.py`, `RecordPanels`, `DataTable`, `StatusBadge`, `KpiCard`, the wide `Modal` and the Money tabs' stubs. The specs are the authority: where the build finds them wrong, it surfaces the conflict instead of deciding.

## Files that change

Backend:

- `backend/app/db.py` — the `invoices`, `invoice_lines` and `payments` tables, `billing_address` on `organizations`, and the Documents columns on `company_settings` (`invoice_design`, `accent_color`, `logo_data`, `logo_content_type`), as `docs/specs/design.md` has them.
- `backend/migrations/versions/0006_invoices.py`, `0007_billing_address.py`, `0008_documents.py` (new) — one migration per step above. The invoice migration adds the unique `number` and the partial unique index on `deal_id` where the status is not `void`; the documents migration gives rows that predate it the Classic design and the Midnight accent (company-settings decision 18).
- `backend/app/routes/invoices.py` — fills the stub: create from a won deal, list (`q` over number, organization and deal, sort, status filter, `deal_id` and `organization_id`), `GET`, `PUT` and `DELETE` on a draft, issue, void, and the payments routes under `/api/invoices/{id}/payments`. `HOLDS` registers the invoice's deal and organization links, void invoices included.
- `backend/app/invoice_pdf.py` (new, above the areas) — draws the invoice's PDF in one of the three designs with the accent, the logo and the brand fonts.
- `backend/app/images.py` (new, above the areas) — checks an uploaded logo's real type from its bytes, whatever the name says.
- `backend/app/routes/company_settings.py` — the Documents fields on `PUT /api/settings` with the 4.5:1 accent check, and `GET`, `PUT` and `DELETE /api/settings/logo`.
- `backend/app/routes/deals.py` — a 409 on a value change while a non-void invoice holds the deal.
- `backend/app/stats.py` — the dashboard's money figures: what customers owe, how much is overdue, the five aging buckets and the payments received in each of the last 12 months.
- `backend/app/seed.py` — one invoice per won deal of the last 12 months with its lines and payments, billing addresses on the invoiced organizations, and the sample logo and design on the settings row.
- `backend/app/fonts/` (new) — TTF copies of Instrument Sans and JetBrains Mono for the PDF; the repo's woff2 files can't be embedded.
- `backend/app/assets/` (new) — the sample company's logo, a small PNG.
- `pyproject.toml`, `uv.lock` — fpdf2, the one new dependency (the case is in Risks).

Frontend:

- `frontend/src/api/client.ts` — the `Invoice`, `InvoiceLine` and `Payment` types, the Documents fields on `CompanySettings`, the logo endpoints.
- `frontend/src/api/invoices.ts` (new) — the area's request helpers, in the seam `client.ts` left for each area.
- `frontend/src/lib/invoice.ts` (new) — an invoice's status, balance and aging, shared by the list, the invoice page and the dashboard.
- `frontend/src/components/InvoicePreview.tsx` (new) — the document: the three designs, the accent and logo, the Bill to block, the PAID, OVERDUE and VOID marks; used by the invoice form and the Settings sample.
- `frontend/src/components/InvoiceForm.tsx` (new) — the wide dialog's form beside its live preview: lines from active products, quantities, editable descriptions and prices, and the allocation against the deal's value.
- `frontend/src/pages/money/InvoicesTab.tsx` — replaces its stub with the invoices table: no Add, Edit and Delete on drafts, Void and Download PDF on issued invoices, search and a status filter.
- `frontend/src/pages/money/Invoice.tsx` (new) — the invoice's page under the Invoices tab: the document, the paid-against-owed bar, the payments with who entered them, and the actions its state allows.
- `frontend/src/pages/money/DealInvoices.tsx` and `frontend/src/pages/money/OrganizationInvoices.tsx` (new) — the panels, registered in `routes.tsx`'s `DEAL_PANELS` and `ORGANIZATION_PANELS`.
- `frontend/src/routes.tsx` — the invoice page under `/money/invoices/*` and the two panels registered.
- `frontend/src/pages/Settings.tsx` — the Documents section: design, accent and logo with its own Save and a sample invoice beside it that updates as you choose.
- `frontend/src/pages/Dashboard.tsx` — the Money section below the sales charts: two `KpiCard`s, the aging bars and the payments line chart.
- `frontend/src/pages/Deal.tsx`, `frontend/src/components/DealForm.tsx` — Create invoice on a won deal with no non-void invoice, and the value read-only while one exists.
- `frontend/src/pages/Organization.tsx`, `frontend/src/components/OrganizationForm.tsx` — the billing address on the form and on the page.
- `frontend/src/styles/` — the document, the paid bar and the Money section; the document stays paper-white in both themes (look-and-feel decision 20).

Tests, named in Proof: new `backend/tests/test_invoices.py`, `test_payments.py`, `test_invoice_pdf.py`, `test_images.py`; extended `test_company_settings.py`, `test_dashboard.py`, `test_seed.py`, `test_holds.py`, `test_cascade.py`, `test_migrations.py`; new frontend `lib/invoice.test.ts`, `components/InvoiceForm.test.tsx`, `components/InvoicePreview.test.tsx`, `pages/money/InvoicesTab.test.tsx`, `pages/money/Invoice.test.tsx`; extended `Settings.test.tsx`, `Dashboard.test.tsx`, `Deal.test.tsx`, `DealForm.test.tsx`, `Organization.test.tsx`, `routes.test.tsx`; new `e2e/invoices.spec.ts` and `e2e/payments.spec.ts`, extended `e2e/settings.spec.ts` and `e2e/dashboard.spec.ts`.

Docs: `docs/STATUS.md` at the end. The specs were written at Design and change only if the build finds a conflict, which is raised with the person first.

## Order of work

Each phase ends with the tests named in Proof for it passing and the earlier ones still passing.

1. **Data model and migrations.** The three tables and the two new columns in `db.py`, the three migrations, and the migration tests: every earlier revision upgrades to head and keeps its rows, and the schema the migrations build is the one the tables define.
2. **The invoice API.** Create from a won deal starting with one line of the whole value, the lines held to the deal's value, draft edit and delete, issue through `documents.take_number` with the snapshots and the totals worked out on the backend, void, the holds registered, and the 409 on the deal's value. Numbers stay without gaps or repeats when two issues land at the same moment.
3. **Payments.** The payments routes, the balance and the worked-out status — part paid, paid, overdue — with the rules in one module the routes and the tests share.
4. **The PDF.** The TTF fonts, `invoice_pdf.py`'s three designs with the accent, logo and marks, `images.py`, and the download route named after the number.
5. **Settings Documents.** The fields on the settings save with the accent contrast check, the logo endpoints, and the defaults for rows that predate the section.
6. **The document on the frontend.** `lib/invoice.ts`, `InvoicePreview` and `InvoiceForm`, the create dialog on the deal page driven from the route's query the way New deal is, and the preview following the form exactly.
7. **The lists and the pages.** The Invoices tab, the invoice page with its payments and actions, the deal and organization panels, the billing address and the locked value on their forms.
8. **The dashboard's Money section.** The money figures in `stats.py` and the section below the sales charts.
9. **Sample data.** The year of invoices and payments, the billing addresses, the logo and the design; the seed's own invariants tested; the dark-mode screenshots refreshed, since the data under them changed.
10. **The full check.** `npm run check`, everything it finds fixed, `docs/STATUS.md` updated. The plan ends with the build; ui-check, the review and `docs/IMPROVE.md` come later.

## Risks

1. **One new dependency: fpdf2.** It installs with uv and runs on Render's native Python runtime because it is pure Python with no C extension and no system packages, it embeds TTF fonts, and it draws strings as text, so anything typed onto an invoice stays plain text on the PDF. The alternative, ReportLab, brings a compiled extension. The PDF tests must stay fast: one small document each, no repeated font embedding.
2. **The PDF's fonts.** The app bundles woff2, which a PDF cannot embed. TTF copies of Instrument Sans and JetBrains Mono come from Google Fonts under the same OFL licence and are committed beside the backend; same families, so the preview and the PDF agree.
3. **Numbers with two people at once.** `documents.take_number` already takes the number in one atomic step inside the saving transaction. What is left is the proof: two issues at the same moment through two connections must come out INV-0001 and INV-0002 with no gap, in one test that cannot flake on SQLite's lock or cost the one-second rule.
4. **An issued invoice frozen on every path.** Three things hold it: `PUT` and `DELETE` refuse outside the draft, issue snapshots the tax label and rate and the Bill to block, and the partial unique index holds one non-void invoice per deal on SQLite and Postgres alike. The UI is not one of them; tests go straight at the API.
5. **Rules written twice.** The sums are already twins run against `shared/totals-cases.json`. The new twins are the accent's 4.5:1 check, the status precedence and the aging buckets. Each stays in one module per side — `images.py` and the upload form, `lib/invoice.ts` beside the backend's status logic — and where one cases file can serve both, it does.
6. **Dates and today.** Issue, due and payment dates are plain calendar dates; `company_settings.updated_at` is UTC. Overdue means owed after the due date — due today is not overdue. Every test that checks a date uses the clock the value was made from (AGENTS.md).
7. **The merge with quotes and bills.** Both neighbours are being built in other worktrees and collide in the known ways: migration numbers, which get renumbered at the merge; a dashboard Money section each, where ours shows what customers owe only, as dashboard decision 6 says; and shared components near the ESLint complexity limit once combined. Shared-file edits stay minimal. Test runs take turns on this computer, so a check can wait minutes before it starts.
8. **Sample data that satisfies its own rules.** Each of the twelve won deals' invoices must carry a subtotal equal to its deal's value, most paid, some part paid, some overdue across the five buckets and a few drafts, or the panels and charts start empty. The seed tests assert those invariants rather than pinning exact rows.
9. **URL state.** The create and issue dialogs open from the route's query and survive a refresh and a revisit, the way New deal does, and are tested from the same route — the failure this guard exists for (AGENTS.md).
10. **The gates.** Complexity at most 15 per function, coverage at least 80%, ty and gitleaks clean, every unit test under a second. `npm run check:quick` runs as each phase lands; the full `npm run check`, with the end-to-end suite on its own servers and database, closes the build.

## Proof

Backend unit tests, pytest:

- `backend/tests/test_invoices.py` — creating an invoice on a won deal starts with one line carrying the deal's value; lines that do not add up to the deal's value are refused, and one that adds up is saved; only a won deal takes an invoice, and the database itself refuses a second non-void one; a line keeps the product's name and price after the product is renamed and repriced; a quantity outside 1 to 1,000,000 and an amount over the column's limit are refused; a draft is edited and deleted and its lines go with it; issuing takes the number, the issue date given and the due date from the payment terms; issuing freezes the tax label and rate and the Bill to block from later changes to Settings, the organization and the contact; `PUT` and `DELETE` refuse once issued and the number never changes; voiding keeps the number and refuses while payments exist; a voided invoice does not stop a replacement; the API refuses a change of value on a deal with a non-void invoice and allows it again after the draft is deleted or the invoice voided; two invoices issued at the same moment take INV-0001 and INV-0002 with no gap and no repeat; the list searches number, organization and deal and filters by status, showing no number or balance for a draft and no balance for a void one; the deal and organization views list every invoice, void ones included.
- `backend/tests/test_payments.py` — a payment is more than zero and no more than what is still owed and dated no later than today; its method is one of the five and its reference is optional; a draft or a void invoice takes none; payments bring the balance down and the invoice reads part paid, then paid at zero; an invoice still owed after its due date reads overdue and one due today does not; deleting a payment puts the balance back up and records who entered the one that remains.
- `backend/tests/test_invoice_pdf.py` — the PDF is made at download and named after the number; its totals equal the app's to the cent on an invoice of three lines; text typed onto the invoice is drawn as text, so markup such as `<b>x</b>` appears literally; the PAID, OVERDUE and VOID marks name their status; each of the three designs draws with the accent and the logo and the frozen letterhead and Bill to block.
- `backend/tests/test_images.py` — a PNG and a JPEG are accepted whatever their name; a text file renamed to end in `.png` is refused; an SVG is refused; a file over 1 MB is refused; the accepted bytes come back at the logo's address with their content type.
- `backend/tests/test_company_settings.py` (extended) — the Documents fields save with the rest and move the last-change line only when a value differs; an accent below 4.5:1 against white is refused with a clear message through the API; the logo uploads, serves and removes; a save that changes nothing leaves the last-change line alone.
- `backend/tests/test_dashboard.py` (extended) — what customers owe counts issued invoices' balances only; the overdue total and the five aging buckets — not yet due, 1 to 30, 31 to 60, 61 to 90, over 90 — match the invoices behind them, with due today in not yet due; the payments per month match the payments' own dates over the last 12 buckets.
- `backend/tests/test_seed.py` (extended) — every won deal of the last 12 months has one invoice whose subtotal is its deal's value and whose lines add up to it; the statuses spread across paid, part paid, overdue at different ages and draft; the invoiced organizations have billing addresses; the settings row has the design and the logo.
- `backend/tests/test_holds.py` (extended) — deleting a deal or an organization an invoice points at is refused with the count in the message, void invoices included; `test_cascade.py` (extended) — deleting a draft takes its lines with it and nothing else.
- `backend/tests/test_migrations.py` (extended) — a database at each earlier revision upgrades to head, keeps its rows and gains the Documents defaults.

Frontend unit tests, Vitest:

- `frontend/src/lib/invoice.test.ts` — the status precedence reads void and draft first, then paid, overdue, part paid and issued; the balance is the total minus the payments; the aging puts an invoice in the right bucket with due today not yet due.
- `frontend/src/components/InvoicePreview.test.tsx` — each design draws the letterhead, the lines and the totals; the Bill to block carries the billing address when there is one and only the name and contact when not; the PAID, OVERDUE and VOID marks name their status in text; typed descriptions and names appear as plain text; the preview is paper-white in both themes.
- `frontend/src/components/InvoiceForm.test.tsx` — a line's amount and the subtotal, tax and total follow `lib/tax.ts` as you type; the form shows the deal's value and what is still to allocate and will not save while the two differ; the preview beside it updates with every change; editing a draft saves what changed, and a save that changes nothing leaves the form showing what the server stored.
- `frontend/src/pages/money/InvoicesTab.test.tsx` — the columns for number, organization, deal, issue date, due date, total, balance and status; the search and the status filter; no Add anywhere; a draft offers Edit and Delete and an issued invoice offers Void and Download PDF and nothing that changes it.
- `frontend/src/pages/money/Invoice.test.tsx` — the page shows the document, the bar of paid against still owed and the payments with who entered them; the actions follow the status; recording a payment moves the balance at once and deleting one puts it back; a refused payment shows the server's message.
- `frontend/src/pages/Settings.test.tsx` (extended) — the Documents section saves apart from the company details and both move the last-change line; the sample invoice follows the design and accent as they are chosen; a low-contrast accent is refused with a message on the page; the logo uploads and can be removed.
- `frontend/src/pages/Dashboard.test.tsx` (extended) — the Money section's two KPI cards, aging bars and payments line come from the payload and match it.
- `frontend/src/pages/Deal.test.tsx`, `DealForm.test.tsx` (extended) — Create invoice shows on a won deal with no non-void invoice and not otherwise; the value field is read-only while one exists and editable again after it goes; the dialog opens from the route's query and survives being revisited.
- `frontend/src/pages/Organization.test.tsx` (extended) — the billing address edits on the form and shows on the page.
- `frontend/src/routes.test.tsx` (extended) — the invoice page opens under `/money/invoices/:id` and an unknown tab still falls back to Quotes.

End-to-end tests, Playwright in `e2e/`:

- `e2e/invoices.spec.ts` — on a won deal, Create invoice opens the wide dialog and a three-line invoice adds up in the form and in the preview; saving keeps the draft and it can be edited; issuing from the dialog gives the number and the due date from the settings' terms; the issued invoice shows no way to change it and the API refuses a change; Download PDF saves a file named after the number; after voiding, the number stays and a replacement invoice can be created; the invoice opens from the Invoices tab, whose search and status filter work, and from the deal's and the organization's panels.
- `e2e/payments.spec.ts` — recording payments brings the balance to zero and the invoice reads paid; a payment for more than the balance is refused with its message; deleting a payment puts the balance back; an invoice past its due date reads overdue on its page, in the list and on the dashboard, and its PDF carries the mark.
- `e2e/settings.spec.ts` (extended) — the Documents section: changing the design and the accent changes the sample invoice; the logo uploads and appears on it; a text file renamed `.png` is refused; an accent below 4.5:1 is refused with its message.
- `e2e/dashboard.spec.ts` (extended) — the Money section's owed and overdue figures, its five aging buckets and its payments chart match the invoices and payments behind them.

Success criterion 1 of the intent — `npm run check` passing — is the end of the build, and the tests above are the evidence for the other nine.
