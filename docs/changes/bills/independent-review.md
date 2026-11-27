# Independent review: bills

Reviewed `git diff b032404...2fcb6cb` (merge base `b032404`, HEAD `2fcb6cb`) against `docs/REVIEW.md`, with `docs/spec.md`, the area files, `docs/changes/bills/plan.md` and `docs/STANDARDS.md`. Read-only: this file is the only thing written.

## Evidence

- `npm run test:backend`: 236 passed, coverage 98.69%.
- `npm run test:frontend`: 381 passed, 95.07% statements / 91.58% branches / 95.9% functions / 94.92% lines.
- `node --test scripts/*.test.mjs`: 34 passed.
- `npm run check:static`: `tsc`, ESLint (the one pre-existing `DataTable.tsx` warning), Prettier, ruff, `ty` and gitleaks all clean.
- **Not run: the full `npm run check` and the Playwright suite.** The e2e run I started queued behind other test runs on this computer (the quotes and invoices worktrees were running) and had not produced a Playwright result when I stopped it at my timeout. `docs/STATUS.md` records the full green run (722 tests, 71 e2e), but this review did not reproduce that part, so the verdict is conditional on the end-to-end suite.
- Manual pass: served the branch against a temporary SQLite database on ports 8002/5175, signed in as Alex, and opened `/money/bills`, `/` and an organization page at 1024x768. None scrolled sideways (`scrollWidth - innerWidth` was 0 on all three), the Bills table and its status filter render, and the Money section shows $4,158 across 6 bills, $1,782 across 3 overdue, and $2,376 across 3 due soon, with its three-row timeline and 12 spending bars.

## Passes

- **Bugs.** Create, edit, delete, mark paid and mark unpaid all refresh `["bills"]` and `["dashboard"]`; the `["bills"]` prefix also reaches the organization panel's `["bills", "organization", id]`. Mark paid and mark unpaid flip optimistically, send the day the click happened on, and settle on the server's copy after the refetch; a failure puts the row back and says why. A save that changes nothing keeps `updated_by` on the API (`test_who.py`). The previous round's Important (mark paid/unpaid refreshed nothing and never sent the page's day) is fixed and covered by `BillsTab.test.tsx`.
- **Security.** The bills router sits behind the app's router guard (`backend/app/main.py:58`), migration `0006` enables row-level security on Postgres, `BillIn` takes no total or paid date, and gitleaks found nothing.
- **Spec and plan.** The tab, the record, the paid/unpaid actions, the per-supplier number rule, the organization panel, the dashboard figures and the spending chart match `docs/specs/bills.md` and `docs/specs/dashboard.md`. The plan's file list is stale (nit 1).
- **Described by the spec.** The behavior has a home in `docs/spec.md`, `docs/specs/bills.md`, `dashboard.md`, `money.md`, `organizations.md`, `tables.md`, `design.md`, `look-and-feel.md` and `running.md`; nothing is undocumented beyond the edges in the nits.
- **STANDARDS.md.** Names read; functions are short and one-purpose; comments say why; no dead code; no dependency added; the complexity gates pass.

## Important

None. No finding met the bar: the main write and read paths work, the API is behind the guard, and the previous round's Important is fixed. The two behavior edges below (nits 2 and 5) are edge cases rather than broken main flows; a person could reasonably raise either to Important, hence their detail.

## Nits

### 1. The plan and STATUS do not describe the files the build actually changed

`docs/changes/bills/plan.md:69` puts `holds.py` under "Untouched ... need no edits", but `backend/app/holds.py:57-62` changes the counting from the link column's values to the holding record's id. That change is needed and correct — it is what makes "This organization has 2 bills" count two bills — so the plan's list is wrong, not the code. `frontend/src/lib/dates.ts:78-92` (`isoToday`, `isoAddDays`) and `e2e/crud.spec.ts:179-182` (the 90-second timeout) are also in the diff but in neither file list. And `docs/STATUS.md:420` says the plan's `routes.test.tsx` line "was corrected", while `docs/changes/bills/plan.md:142` still lists `routes.test.tsx` with a mocked-API claim that file does not have. Update the plan's file list and Proof line, and the STATUS sentence, or say why those files are out of scope.

### 2. The edit dialog never moves the due date when the bill date changes

`frontend/src/pages/money/BillForm.tsx:42-45` sets `dueEdited: Boolean(bill)`, so for every existing bill `changeBillDate` (`:74-78`) leaves the due date alone. `docs/specs/bills.md:12` says "the due date moves when the bill date changes until it is changed by hand"; the add dialog follows (`BillForm.test.tsx:74-97`), the edit dialog does not, and no test covers the edit path. Keeping a stored due date is defensible if it is a hand-set value, but if it was the 30-day default, correcting the bill date leaves the due date tied to the old bill date, not the corrected one. Decide which rule the spec means (and write the edit rule into the spec if the stored date wins) and add a test either way.

### 3. The Add dialog can open with no supplier option

`frontend/src/pages/money/BillsTab.tsx:32-35` reads `organizations` with a `[]` default and no error state; `frontend/src/pages/money/BillForm.tsx:23-29` starts `organizationId` as `""` when that list is empty, and the supplier select is required (`:136-148`). If the organizations query is slow or fails, Add opens with no supplier, the browser refuses the submit, and the dialog gives no reason. This was accepted last round and is still visible in the seed e2e (`e2e/bills.spec.ts:369-382`), which adds a bill without choosing a supplier and depends on the query having arrived. Disable Add until the query resolves and show its error, or make the form wait for the options.

### 4. The dashboard e2e can read the dashboard before the mark-paid write lands

`e2e/dashboard.spec.ts:352-360` clicks Mark paid, asserts the optimistic badge, then navigates to the dashboard and asserts the new total and bar. It never waits for the POST reply, so the dashboard's refetch can run on the cached payload before the write invalidates it, and the test can fail on a slow machine. This was accepted last round; `e2e/bills.spec.ts:83-89` already has the `markResponse` helper, which would remove the race.

### 5. The spending window and the page's paid day use two clocks

`frontend/src/pages/money/BillsTab.tsx:153` sends the browser's day for the paid date, while `backend/app/stats.py:208-223` builds the 12 buckets and skips `capped < lower` from the server's `date.today()`. On Render (UTC), a bill paid at 8pm on Nov 30 in the Americas is stored with `paid_date = 2026-11-30`, but on Dec 1 UTC the window is January to December and the bill is skipped, so the November bar misses that bill. `docs/specs/dashboard.md:11` says the chart counts each paid bill in the month it was paid. The sales charts' `won_summary` uses the same server-clock window, so this may be a deliberate product-wide rule; either carry the page's day to `/api/dashboard` the way Mark paid now does, or state the server clock in the spec and AGENTS. As written it is an edge on the last day of a month for users behind UTC.
