# Independent review: invoices

The `invoices` branch at `01409fb` reviewed against `main` (`b032404`), following
`docs/REVIEW.md`. Style and the `docs/STANDARDS.md` pass are skipped at the
person's request; the other passes are below. I changed nothing except this file.

## Evidence

- The real diff, `git diff b032404...HEAD`: 112 files, +10650/−174. It includes
  the API and its three migrations, the PDF and logo helpers, the seed and the
  stats, the Invoices tab, the invoice page, the deal and organization panels,
  the Settings Documents section, the dashboard Money section, and the new unit
  and end-to-end specs. Files the plan's file list misses
  (`backend/app/holds.py`, `backend/app/documents.py`,
  `frontend/src/pages/Deals.tsx`, `frontend/src/lib/charts.ts`,
  `e2e/helpers.ts`, `scripts/make_logo.py`) were reviewed too; the branch's
  STATUS records most of those deviations.
- Ran here: `npm run test:backend` — 272 passed in 37.0s, coverage 98.21%.
  `npm run test:frontend` — 42 files, 414 tests passed, 92.32% statements /
  88.46% branches / 91.31% functions / 92.39% lines. `npm run test:scripts` —
  34 passed. `npm run check:static` — green: Prettier, ESLint (one pre-existing
  React Compiler warning, no errors), `tsc`, `ty`, ruff and gitleaks.
  `npm run test:e2e` — 77 passed in 16.9m, the invoice and payment specs
  included. The wrapper exited 1 after the summary with no failed test and no
  error text; a five-test rerun of `e2e/invoices.spec.ts` also passed 5 and
  exited 1. The branch does not change `scripts/e2e.mjs` or
  `scripts/test-run.mjs`, and other test runs were in flight on this machine,
  so I treat the wrapper's exit code as unconfirmed rather than a test
  failure.
- Probes, with the app on a temporary SQLite database and threads held at the
  points named in the findings: two issue requests on the same draft both
  returned 200 (`INV-0001` and `INV-0002`; stored `INV-0002`; counter 2), an
  edit and an issue both returned 200 with the issued line changed, and two
  100,000-cent payments both returned 201 on a 108,875-cent invoice (200,000
  stored). A deal at the permitted 2,147,483,647 cents with the sample 8.875%
  tax issued on SQLite with `total_cents` 2,338,072,821. A PNG header followed
  by junk was accepted as a logo (200), then the PDF route raised
  `OSError: Truncated File Read`. A 60-line invoice built one page whose line
  table ended at y=568.5mm on a 279.4mm page.
- Not run here: Postgres (every automated test is SQLite), so finding 3's 500 is
  argued from the `Integer` columns and the SQLite probe; and a visual page walk
  by me. The full `npm run check` was not rerun as one command; its backend,
  frontend, script, static and end-to-end parts are above.
- The branch's working tree also carries an uncommitted edit to `docs/STATUS.md`
  (the 797-test proof) that was not made by this review and was left as found;
  the findings below are against `HEAD` `01409fb`.

## Important

### 1. The same draft can be issued twice, and an edit or delete can change it after issue

`issue_invoice` reads the invoice and checks `status == "draft"` at
`backend/app/routes/invoices.py:195-197`, then updates by id at `:203-220`; the
status is not in the `WHERE`. Two requests on one draft both pass, both call
`documents.take_number`, and the second update overwrites the first. The probe
above is the evidence: both 200, stored `INV-0002`, and `INV-0001` left unused.
That breaks `docs/specs/invoices.md` decision 3 ("From then on the invoice is
fixed") and the intent's "no gaps or repeats".
`test_two_issues_at_the_same_moment_take_inv_0001_and_inv_0002`
(`backend/tests/test_invoices.py:470`) only races two different deals, so it
cannot see this.

`update_invoice` (`:149-161`) and `delete_invoice` (`:165-180`) have the same
read-then-write shape: both check the draft and then write or delete by id. The
probe held an edit and an issue and both returned 200; the issued invoice's line
became "Changed". A delete can remove an issued invoice and leave its number
unused.

Fix: make the status part of every write (`UPDATE ... WHERE id = :id AND
status = 'draft'`, check the affected rows before returning) and, for the
delete, guard the row before its lines; take the number only after the issue's
update applies, or hold the row with `SELECT ... FOR UPDATE` on Postgres. Add
two-thread tests for the same draft: issue against issue, and edit/delete
against issue.

### 2. Two payments can overpay an invoice, and a payment can land on a void one

`record_payment` (`:263-283`) calls `_checked_payment` (`:300-309`), which reads
the invoice total and the payments' sum, then inserts; there is no lock or
conditional write. The probe's two 100,000-cent payments on a 108,875-cent
invoice both returned 201 and stored 200,000, a negative balance and a paid
invoice. `void_invoice` (`:223-241`) counts payments and then sets void; a
payment inserted between the count and the update makes a void invoice with a
payment, and that also means an invoice with a payment was voided. Both break
`docs/specs/invoices.md` decision 6 ("no more than what is still owed", and a
void invoice takes none) and "an invoice with payments can't be voided".

Fix: lock the invoice row for the whole payment and void (`SELECT ... FOR
UPDATE` on Postgres, an immediate transaction on SQLite) or make the insert
conditional on `status = 'issued'` with the balance checked inside the same
transaction; guard the void's no-payment check and its status write together.
Add threaded tests for two payments and for payment against void.

### 3. The tax and total can leave the 32-bit money columns

`_checked_lines` checks each line and the subtotal (`:347-357`), and
`issue_invoice` writes `tax_cents` and `total_cents` from `tax.totals`
(`:199-215`) without checking them. Both are `Integer` columns
(`backend/app/db.py:169-170`,
`backend/migrations/versions/0006_invoices.py:38-39`). The probe: a deal at the
permitted 2,147,483,647 cents with the sample 8.875% tax issues on SQLite with a
total of 2,338,072,821; on Postgres that update raises
`NumericValueOutOfRange` (a 500) because int4 stops at 2,147,483,647. At a 100%
tax the total is twice the subtotal. `docs/specs/invoices.md` decision 2 says
every amount stays within the money columns' limit, and the API's own
`AMOUNT_MESSAGE` names the limit.

Fix: check the tax and total (and the draft reply's computed total) against
`MAX_AMOUNT_CENTS` at create, edit and issue, returning a 400 with
`AMOUNT_MESSAGE`; add a boundary test with the 8.875% sample and a 100% rate.
The frontend should show the same message.

### 4. A corrupt image passes the logo check and then every PDF returns 500

`images.checked_type` (`backend/app/images.py:24-43`) only compares the first
bytes with the PNG/JPEG magic; `save_logo` stores them. `invoice_pdf._logo_box`
(`backend/app/invoice_pdf.py:202-209`) opens them with Pillow. The probe's PNG
header plus junk was accepted as `image/png`, and the next PDF request raised
`OSError: Truncated File Read` (a 500) from `download_pdf`
(`backend/app/routes/invoices.py:245-260`). The preview shows a broken logo;
every invoice's PDF fails until the logo is removed.
`docs/specs/company-settings.md` decision 23 says the backend checks the file
really is an image of that type; a header is not the image.

Fix: open and fully load the bytes with Pillow in `checked_type` and refuse
`OSError`/`UnidentifiedImageError` with `NOT_AN_IMAGE`; also catch a decode
failure in `invoice_pdf` so a bad stored row cannot 500 the route. Add a
truncated-but-magic test and a corrupt stored logo test.

### 5. An invoice longer than one sheet loses lines on the PDF and in the preview

`invoice_pdf.build` turns automatic page breaks off (`:39`) and never adds a
page; `_lines_table` (`:271-299`) draws every row. The 60-line probe built one
page and its table ended at 568.5mm on a 279.4mm page, so the later rows are
outside the sheet. The preview has the same limit: `.invoice-sheet` fixes
`aspect-ratio: 8.5 / 11` and `overflow: hidden`
(`frontend/src/styles/brand.css:1580-1586`). The form does not cap the lines,
and the Compact design, which says it is for invoices that run long, still
clips. The PDF test's `pdf_text` reads text from the content stream even when
it is drawn outside the page, so the three-line PDF tests cannot see it.

Fix: paginate the lines (repeat the heading and put the totals and mark on the
last page) or refuse more lines than the design can show with a clear message;
make the preview show the whole document. Add a test whose line count overflows
the sheet and asserts the page count or the visible rows.

## Nits

1. **Clearing the issue date shows "Due Invalid Date".**
   `frontend/src/components/InvoiceForm.tsx:111-117` builds a date from whatever
   is in the field, and the hint at `:406-408` calls it whenever the field is
   rendered. Clearing the date makes `plusDays("")` return `NaN-NaN-NaN` and
   `formatDate` return "Invalid Date", so the page says "Due Invalid Date from
   the payment terms." before the "Choose an issue date." alert. Guard the hint
   on a non-empty date and add it to the cleared-date test; `InvoiceForm.test.tsx`
   currently checks only the alert.
2. **The draft delete confirmation does not name the lines.**
   `docs/specs/tables.md` decision 12 says the draft's delete confirmation names
   the lines that go with it; both `InvoicesTab.tsx:216-219` and
   `Invoice.tsx:199-203` say only "Its lines go with it." The API returns the
   descriptions in `delete_invoice` (`invoices.py:172-180`), but after the
   delete. Pass the invoice's lines (or fetch them) into the dialog before
   confirming; test the text.
3. **The API accepts an archived product on a new line.**
   `docs/specs/invoices.md` decision 2 says lines come from active products;
   `_require_products` (`invoices.py:380-383`) checks only that the product
   exists. A probe archived a product and created an invoice with it: 201. The
   form filters `product.active`, so the page is fine; the API is not. Refuse an
   archived product that is not already on the invoice, and add the API test.
4. **Saving one Settings form discards unsaved edits in the other.**
   `frontend/src/pages/Settings.tsx:83` and `:98` key both forms on
   `settingsQuery.data.updated_at`; saving the company details or uploading or
   removing a logo changes it and remounts the Documents form, losing a chosen
   design or accent; saving Documents remounts the company form, losing typed
   company details. The comment at `:81-82` says the refresh is deliberate, but
   the untouched form's edits should survive. Give each form its own reply and
   state, or key it only when that form saves; test the cross-form case.
5. **The invoice page does not show who added or last changed it.**
   `docs/specs/sign-in.md:6` says an invoice shows both on its page; the API
   returns `created_by`/`updated_by`, and
   `frontend/src/pages/money/Invoice.tsx:485-531` never renders
   `RecordAttribution` (the deal, organization and contact pages do). Add it
   below the title or in a details panel; test.

## Pass notes

- **Bugs:** The sequential paths were walked: create with the default line and
  with several lines, a no-op edit and a real edit, issue, void, draft delete, a
  payment and its delete, Settings and Documents saves and logo upload/remove,
  the value lock, and the cleared issue date and blank line controls. The
  value-changed and no-change paths both show the stored reply; the issue-date
  refusal and the blank line/amount messages are on the page. The failures found
  are the two concurrency classes, the money-column edge, the corrupt image and
  the long document, plus the cleared-date hint.
- **Security:** The new router rides `main.py`'s `Depends(auth.current_user)`,
  the local sign-in is loopback-only, `test_every_route` and
  `e2e/security.spec.ts` cover the routes, and `0006` turns on RLS for the three
  new tables. Attribution comes from the checked token; no secrets or personal
  data are added; the invoice number's prefix pattern prevents header injection,
  and the PDF draws text, not markup. The weak logo check is finding 4, not a
  leak.
- **Matches the spec and plan.md:** The sequential feature matches
  `docs/specs/invoices.md` decisions 1-10 and the area files, with the
  exceptions in findings 1-5 and nits 1-5. The plan's file list misses
  `holds.py`, `documents.py`, `Deals.tsx`, `lib/charts.ts`, `e2e/helpers.ts` and
  `scripts/make_logo.py`; STATUS records most of those, so I did not make a
  separate finding. The proof's counts (272 backend, 414 frontend, 34 script,
  77 end-to-end) match the runs here.
- **Described by the spec:** Every behavior in the diff has a home in
  `docs/spec.md` or an area file: invoices 1-10, dashboard 6, company-settings
  21-23, deals 5, organizations 2-3, tables 12, sign-in 6, look-and-feel 20. The
  missing attribution (nit 5), the delete names (nit 2) and the active-product
  rule (nit 3) are spec lines the build does not yet meet; no behavior was found
  with no home at all.
- **Matches STANDARDS.md:** Skipped at the person's request.

## Relation to the branch's own notes

`docs/STATUS.md` records a previous review with two Important findings (the
refused issue dialog and the sample-data counts; both fixed here) and five
Nits. This review repeats the archived-product nit and raises the magic-bytes
logo point from Nit to Important, because it is a 500 on every PDF and the
spec's upload rule, not only a weak check. The other three recorded nits (the
1,000,000-byte page cap, the payment dialog's clock and `canCreate` on a
loading list) are not repeated. The new findings are the two concurrency
classes, the money-column total, the long PDF, the cleared-date hint, the
delete wording, the Settings cross-form edit loss and the invoice attribution.

The README and STATUS call invoices "done and reviewed"; with the Important
findings open, that claim is ahead of this review and should be rechecked after
the fixes.

## Verdict

**Not ready to merge: five Important findings.** The sequential flows and the
unit and static gates are green, and all 77 e2e tests passed, but the
frozen-invoice and payment rules can be broken by two requests at once, the tax
and total can leave the 32-bit columns at the app's own limit, and a corrupt
logo or a long invoice breaks the customer document. The nits are small and
local.

Conditional on: the e2e wrapper's exit code here (all 77 tests passed; the
wrapper exited 1 on both the full run and a five-test rerun with no failed test
or error text, which I could not attribute to this branch), no Postgres run,
and no visual page walk by me. Findings 1, 2, 4 and 5 were reproduced on
SQLite; finding 3's Postgres 500 rests on the int4 columns and the SQLite probe.

## Fix status

The five Important findings are fixed in the working tree; the findings above
stay the record of the review as it ran.

1. **Fixed.** `_locked_invoice` takes the invoice row with a no-op update before
   reading its state, so issue, edit and delete take turns; issue and void also
   carry their expected status in the update. Tests: issuing the same draft
   twice takes one number; deleting a draft racing an issue cannot delete an
   issued invoice.
2. **Fixed.** Payment, void and payment deletion take the same lock, so two
   payments cannot overpay and a payment cannot land on a void invoice. Tests:
   two payments at once, and a payment against a void.
3. **Fixed.** `_checked_totals` refuses a subtotal, tax or total over
   `MAX_AMOUNT_CENTS` at create, update and issue; the form shows the same
   message. Tests: a maximum deal at the sample rate, a rate change before
   issue, and the form.
4. **Fixed.** `images.checked_type` opens and loads the bytes with Pillow and
   checks the real format; `invoice_pdf._logo` drops a broken stored logo.
   Tests: a magic header around a broken picture, and a broken stored logo.
5. **Fixed.** The PDF keeps automatic page breaks, repeats the table headings
   and moves the totals to the last page; the preview grows instead of clipping.
   Tests: a 60-line PDF and the preview CSS. `docs/specs/invoices.md` decision 9
   and `docs/specs/look-and-feel.md` decision 20 now describe this.

The invoice page also closes the edit dialog as soon as the issue is accepted
and refreshes after, and the e2e issue assertion waits for the dialog and reads
the page's document. The test-run wrapper's cleanup now logs a cleanup failure instead of turning a
green run red, so the direct wrapper's exit 1 from this review does not recur.
The full `npm run check` after these fixes exits 0: 808 tests (281 backend,
416 frontend, 34 script, 77 end-to-end), backend coverage 97.93%, frontend
92.32% statements / 88.51% branches / 91.31% functions / 92.39% lines,
gitleaks clean.
