# Independent review: quotes

Branch `quotes`, reviewed against `main` from merge base `b032404`. I read the real diff, `docs/spec.md`, `docs/specs/quotes.md` and the area files it touches, `docs/changes/quotes/intent.md` and `plan.md`, `docs/REVIEW.md`, `docs/STANDARDS.md`, and the changed tests. I did not change any code.

## What I ran

- `uv run pytest backend/tests -q`: 255 passed, backend coverage 98.72%.
- `npm run test --workspace frontend`: 388 passed, 96.05% statements / 90.86% branches / 97.11% functions / 95.92% lines.
- `npm run test:scripts`: 34 passed.
- `npm run check:static`: passed (tsc, ty, ruff check and format, Prettier, ESLint, gitleaks). ESLint reports one warning in `frontend/src/components/DataTable.tsx`, a file this branch does not change.
- `npm run test:e2e -- e2e/quotes.spec.ts`: 6 passed. `npm run test:e2e -- e2e/menu.spec.ts e2e/security.spec.ts e2e/contacts.spec.ts e2e/crud.spec.ts e2e/settings.spec.ts`: 32 passed.
- I rendered the 120-row PDF fixture from `test_a_long_quote_flows_over_a_few_pages` directly and read the text positions out of the page content streams to check the page layout.

I did not run the full `npm run check` or the remaining 32 of the 70 end-to-end tests (startup, dashboard, pipeline, products, activities, search, sign-in, screenshots). I also did not repeat the Phase 4 manual browser walk from `STATUS.md`; the verdict below is conditional on those.

## Important

### 1. The PDF's bottom margin is lost, letting a long quote draw to the paper edge

`backend/app/quote_pdf.py:137-141` sets the margins and then calls `pdf.set_auto_page_break(False)`. In fpdf2 2.9.0 that call uses the default `margin=0`, so it sets `b_margin` to 0 and `page_break_trigger` to `279.4mm` — the full Letter height — instead of `279.4 - 20 = 259.4mm` (fpdf2's default 20mm bottom margin). Both `_fit` (`quote_pdf.py:151-157`) and the lines loop (`quote_pdf.py:280-282`) compare against `page_break_trigger`, so a long quote is allowed to draw into the bottom margin and up to the paper edge.

Evidence: I rendered the exact 120-line fixture from `test_a_long_quote_flows_over_a_few_pages` (three lines, repeated forty times). It takes seven pages, with text baselines as low as 4.39pt from the page bottom on pages 2, 4 and 6; several pages draw below the intended 56.7pt (20mm) line. The last rows sit about 1.5mm from the paper edge rather than 20mm, and a last line can be clipped by a printer even though fpdf2 still produces a valid PDF. The existing test only asserts `2 <= pages <= 12` and that no two texts share a position (`backend/tests/test_quote_pdf.py:199-207`), so it passes with the margin gone. The claim in `docs/STATUS.md` that "the same 120 rows take three" pages is not what the current fixture renders (seven); correct that count with this fix.

Fix: `pdf.set_auto_page_break(False, margin=BOTTOM_MARGIN)` with `BOTTOM_MARGIN = 20` (verified: `b_margin == 20`, `page_break_trigger == 259.4`), or re-apply the bottom margin after disabling the automatic break. Add an assertion to the long-quote test that every drawn text stays inside the printable area (for example, at least 56.7pt above the page bottom), not just that pages are few and positions unique.

## Nits

### 1. Copy can put a new quote on a won or lost deal, against the spec's open-deal rule

`docs/specs/quotes.md:7` says a quote is created "from an open deal", and decision 1 (`:16`) says a Won or Lost deal "keeps the quotes it already has and takes no new ones". `backend/app/routes/quotes.py:390-395` only checks that the source is not a draft. Copying an accepted quote — the normal path, because accepting a quote wins the deal — always creates a new draft on a Won deal, and copying a declined quote on a Lost deal does the same.

The intent and plan support copy for any non-draft, so the fix is probably to amend the spec to exempt copy rather than to refuse it. `docs/STATUS.md` already records this as an open nit, and it still holds.

### 2. A failed quote fetch renders "Quote not found"

`frontend/src/pages/money/Quote.tsx:80` checks only `if (!quote)`. That is true for a 404 and also for a network failure or a 500 from `quoteQuery`, so an outage is reported to the user as a missing quote. Add an `isError` branch, as the Quotes list and the panels already do for their queries. This is also already in `STATUS.md` as an open nit.

### 3. The plan says copy is proved for accepted and declined, but the test only covers sent and declined

`docs/changes/quotes/plan.md:168` says "copy (a new number, the same lines, a fresh 30-day validity, the original untouched, from accepted and declined alike)". `backend/tests/test_quotes.py:633-671` copies a sent quote and a declined quote, not an accepted one. The code path is the same (`status != draft`), but the accepted quote is the case the quote page offers most, and the plan's proof does not have it. Add the accepted case.

### 4. The quote page's action buttons have no in-flight guard

`frontend/src/pages/money/Quote.tsx:101-130` starts every action without a pending state, and the buttons at `:143-158` stay enabled. A double-click on Copy sends two copies: `backend/app/routes/quotes.py:390-422` never changes the source quote, so both POSTs succeed and two new drafts exist, and quotes are never deleted. On Send, Accept or Decline the second request can land after the first commits and show a 400 ("Only a sent quote…" or "This deal already has an accepted quote.") under a state that has already succeeded. A fast double Accept can also write two `stage_change` entries if both requests read the deal before either writes, because the status update is not conditional.

Disable the action buttons while a request is pending, and make the accept status update conditional (or locked) so a second request cannot repeat the move. Test a second click on Copy and Accept, not only the first.

### 5. The branch changes another change's screenshots

`docs/changes/dark-mode/dashboard-dark.png`, `dashboard-light.png`, `pipeline-dark.png` and `pipeline-light.png` change in `44b6d53` (`build: quotes`), and `dashboard-dark.png` changes again in `89dd270`. The quotes plan's file list has no `docs/changes/dark-mode/` entry. `e2e/screenshots.spec.ts` regenerates those files on every full run, so they look like test output committed into the dark-mode change's record and rewritten with this branch's sample data. Revert them or state why they belong in this change.

## Passes that held

- **Bugs:** the create, update, send, accept, decline, copy and PDF paths behave as the spec says in the tests I ran. The no-op update leaves `updated_by` alone and the form repopulates from the saved reply; a settings save moves drafts only; an archived product's line stays while a second line of it is refused; accept moves the deal like a drag and writes the timeline entry; a deal and an organization are held by their quotes with the right counts. The exceptions are the findings above.
- **Security:** gitleaks is clean; every quotes route is behind the sign-in guard and `/api/quotes` joins the security walk; the PDF is only served to a signed-in caller; typed text is escaped in React and drawn with `markdown=False` in the PDF. No secret or personal data appears beyond the intended company and sample customer details.
- **Spec and plan:** the change matches `docs/specs/quotes.md` and the area files it updates, apart from the copy/open-deal conflict above and the accepted-copy proof gap. The docs describe the new tables, the states, the PDF, the panels and the sample data. The sample has the states the intent asks for and an accepted quote on every recent win whose subtotal rounds to the deal's value.
- **Numbers in the docs:** the backend, frontend and script counts and the coverage figures in `STATUS.md` match the runs above, and the end-to-end count of 70 matches `npx playwright test --list`. I did not run all 70.
