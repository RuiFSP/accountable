# Independent review: company settings

The branch `company-settings` at `9420bdb` reviewed against `main`, following `docs/REVIEW.md`. Style is skipped at the person's request, so the "Matches STANDARDS.md" pass is not part of this report. The verdict is at the end.

## Evidence

- The real diff, `git diff main...HEAD`: 40 files, +2268/−78 — backend route, migration, seed, db, five backend test files, the Settings page and its lib and tests, the API client, the menu and routes, brand.css, four e2e specs, and the docs. Everything in `plan.md`'s file lists is in the diff; two additions the plan doesn't list are under Nits below.
- **Ran here:** `npm run check:quick` on this checkout exits 0 — Prettier, ESLint (1 pre-existing React Compiler warning, 0 errors), ruff format and check, `tsc`, `ty`, gitleaks, then 155 backend tests (coverage 98.94%), 286 frontend tests (96.26% statements / 92.55% branches / 97.17% functions / 96.13% lines) and 18 script tests. These match the figures `docs/STATUS.md` records for the build.
- **Ran here:** `npm run test:e2e`, the Playwright half: 56 passed in 6.1 minutes, exit 0 — the five settings specs and the menu hover test included.
- **Mechanism probes for finding 1:** `psycopg2.extensions.adapt(datetime.now(UTC)).getquoted()` returns `'2026-11-24T...+00:00'::timestamptz`, and on the project's Supabase database `('2026-11-24 12:00:00+00'::timestamptz)::timestamp` returns the wall clock of `current_setting('timezone')` (UTC there today).
- **Not run here:** a live browser walk of `/settings`, and the settings routes against a real Postgres (every test is SQLite). Finding 1's Postgres effect is argued from the probes above, not from a run.

## Important

An Important finding must be fixed before the change merges.

### 1. An aware UTC datetime is written into the naive `updated_at` column

`backend/app/routes/company_settings.py:111` (`values["updated_at"] = datetime.now(UTC)`) and `backend/app/seed.py:41` (`datetime.now(UTC) - timedelta(days=2)`) both write an aware UTC value into `company_settings.updated_at`, a plain `DateTime` column. `AGENTS.md` "Dates and times" says exactly this is wrong: a UTC moment goes into a `DateTime(timezone=True)` column, or into a naive column as `datetime.now(UTC).replace(tzinfo=None)`, because "an aware value written to a naive column is converted against the database session's timezone on Postgres".

The probes above show the full chain on the copy the way Render runs: psycopg2 sends the aware value as `::timestamptz`, the cast into the naive column happens against the session timezone, and `_as_reply` then labels the stored value UTC. The shown "Last changed ... on ..." moment is right only while the database session timezone is UTC (it is on Supabase today); with any other session timezone every timestamp this change writes is shifted by that offset and presented as UTC. SQLite silently drops the offset, so none of the 155 backend tests or 56 end-to-end tests can see any of this — the whole suite runs on SQLite.

Fix: `.replace(tzinfo=None)` on both writes (or make the column `DateTime(timezone=True)`).

### 2. A test compares a UTC-made date with the local `date.today()`

`backend/tests/test_seed.py:134` asserts `settings["updated_at"].date() == date.today() - timedelta(days=2)`. The value comes from `datetime.now(UTC)`, so the comparison must use `datetime.now(UTC).date()`: `AGENTS.md` "Dates and times" names this mistake exactly — "never `date.today()`, or the test flips whenever the machine's local date differs from the UTC date". It passes today (this machine is on UTC in winter, and CI runners are UTC) and fails between 00:00 and 01:00 local whenever local time runs ahead of UTC — for example WEST in summer, on this machine. It is a broken gate intermittently, not a broken product, but it is a rule in `AGENTS.md`.

Fix: compare against `datetime.now(UTC).date() - timedelta(days=2)`.

### 3. A save that changes nothing leaves the typed text on the page instead of the stored values

`SettingsForm` (`frontend/src/pages/Settings.tsx`) is remounted, and so repopulated from the server's reply, only when `updated_at` changes (`key={settingsQuery.data.updated_at}`, line 37). A save the server treats as a change of nothing returns the row with the same `updated_at`, so the key holds, the form keeps whatever was typed, and "Saved." appears beside it.

Repro: set the tax rate to 0 (blank it and save once — that path is fine, the form remounts and shows "0"), then type two spaces in Tax rate and save. `settingsInput` sends `tax_rate_thousandths: 0`, the server stores nothing and returns the row unchanged, and the page shows `"  "` in the field with "Saved." next to it. The same happens for "0.000" in the rate, "QT-2 " where "QT-2" is stored, or " Brightloop " where "Brightloop" is stored.

Two things in `docs/REVIEW.md`'s bug pass rule this against the change: a save that changes nothing must leave "the page showing what the server stored", and `docs/specs/company-settings.md` says "A blank tax rate or payment terms value saves and shows as 0" — here it saves and shows as blank. The changed-value path is correct and is the only path the tests cover: `Settings.test.tsx`'s save mock always returns a fresh `updated_at`, and the end-to-end no-op test types nothing before saving.

Fix: repopulate the form from the reply on every successful save (for example `setForm(initialSettingsForm(reply))` in `handleSubmit`), and add the no-op-with-edits case to `Settings.test.tsx`.

## Nits

1. **Wrong-shaped bodies get a 422, not the plan's "400 and a plain string in `detail`".** A PUT with no `name`, or with `"tax_rate_thousandths": "high"` or `8875.5`, is refused by Pydantic before `_checked` runs: status 422 with `detail` a list, which the client turns into "Request to /api/settings failed with status 422". `plan.md` promises a 400 with a plain string for a bad value, and `docs/specs/company-settings.md` promises "a clear message ... straight to the API" for a value "in the wrong shape". Every tested case (in-shape, out-of-range) does get the promised 400 and message, so this is a gap at the edges, not in the covered rules.
2. **`plan.md`'s file lists no longer match the diff.** `frontend/src/styles/brand.css` gains a fourth rule (`.user-menu-button:hover`) and `e2e/menu.spec.ts` gains a hover test for it; the plan lists three CSS rules and no such test. Both are recorded in `docs/STATUS.md`'s ui-check section, but the plan's own lists — the change's record — were not updated. The fix itself is sound and covered by a regression test.
3. **Docs claim a review outcome ahead of this review.** `docs/STATUS.md` ends with a review section that already states "found no blocking finding", and `README.md` lists company settings under "Done and reviewed". Both are premature until an independent review's verdict is settled — with the findings above they are out of date as written.

## Pass notes

- **Bugs:** both paths of the write were walked (a value that changes, a save that changes nothing) on the page and through the API — finding 3 is what that walk found. The rest holds: trimming and blank-to-null/0 on both sides, the exact shared boundaries (0, 100000 thousandths; 0–365 days; 10 characters of `[A-Za-z0-9-]`; the same email pattern on both sides), the one-row behaviour, `updated_by`/`updated_at` moving only on a real change and ignoring attribution in the request body, and `_unversioned_revision` now stamping the exact revision so a 0002-schema database can no longer skip the new table.
- **Security:** both routes ride the router's `Depends(auth.current_user)`; `updated_by` comes from the checked token, never the request; the automatic route sweep covers `GET`/`PUT /api/settings` in both copies and `e2e/security.spec.ts` samples it; no secrets or personal data in the diff. The migration turns on RLS with no policy on Postgres, the same posture as the other five tables.
- **Matches the spec and plan:** the plan's lists are all present and the behaviour matches `docs/specs/company-settings.md` and decisions 14–18, apart from nits 1–2 and the spec line that finding 3 breaks.
- **Described by the spec:** the settings work has its home in the spec's new area file. The `.user-menu-button:hover` rule is behaviour added outside the plan; its only spec home is the look-and-feel WCAG line (the initials were invisible on hover in dark mode), which is thin — see nit 2.
- **Style / STANDARDS.md:** skipped at the person's request.

## Relation to the branch's own notes

`docs/STATUS.md` records an earlier review pass with three low findings that overlap findings 1–3 here, judged non-blocking. My independent reading differs on severity: 1 and 2 break rules in `AGENTS.md`, which `docs/REVIEW.md` makes Important by definition, and 3 fails the bug-pass criterion the policy spells out. Nit 3 follows from that.

## Verdict

**Not ready to merge as it stands: three Important findings**, all small and local — two datetime handling fixes and one form-normalisation fix, each with a test gap worth closing alongside.

Conditional on: `npm run check:quick` (run here, green, figures above), `npm run test:e2e` (run here: 56 passed in 6.1 minutes, exit 0), and no live browser walk of the page by this reviewer; finding 1's Postgres effect rests on the probes, not on a run against Postgres.

## Fix status

The three Important findings are fixed in the working tree — naive UTC writes for `updated_at`, the seed test now compares against `datetime.now(UTC).date()`, and the form repopulates from the saved reply on every save (with a regression test that fails without the fix). This document stays the record of the review as it ran; `docs/STATUS.md` holds what the fixes changed and the fresh check result.
