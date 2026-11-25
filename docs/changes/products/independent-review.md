# Independent review: products

The `products` branch against `main`, following `docs/REVIEW.md`. Findings use the
policy's two labels. Style was skipped by request, so `docs/STANDARDS.md` got no
pass. Nothing was changed outside this file.

## Important

None.

## Nits

1. **plan.md is wrong about the spec files.** The "Untouched" section of
   `docs/changes/products/plan.md` says `docs/spec.md` and the area files "already
   describe the change" and need no edits, but the branch creates
   `docs/specs/products.md` and edits six more of them (`spec.md`, `design.md`,
   `look-and-feel.md`, `running.md`, `sign-in.md`, `tables.md`). The spec updates
   themselves are right — AGENTS.md asks for exactly that — but the plan's "Files
   that change" never lists them and was not brought up to date.

2. **A whitespace-only name shows a raw status message.**
   `frontend/src/components/ProductForm.tsx` sends `name.trim()`, so a name of only
   spaces reaches the API as `""`, which `ProductIn`'s `min_length=1` refuses with
   422 before the route's own "Product name is required." — that message fires only
   for an untrimmed `"   "`, which is a 400. The form then displays "Request to
   /api/products failed with status 422" instead of a plain instruction.

3. **No upper bound on the price.** `ProductIn.price_cents` accepts any
   `int >= 0`, but the column is `Integer`: past 2^31-1 the shared copy (Postgres)
   fails with a 500 while the same value stores fine on SQLite. The rule matches
   deals' `value_cents`, so this is parity with the existing record rules rather
   than something new.

4. **The sample copy mixes `license` and `licence`.** "Team license — Per-seat
   licence for a growing sales team." and "Pilot license — A short pilot for one
   team, before a full licence." (`backend/app/seed.py`) sit in the Description
   column beside names that spell it the way `docs/specs/products.md` and the
   README do.

## Passes

- **Bugs:** clean — the flows behave as meant, including the failure paths (a
  failed list shows its message, a refused save keeps the form open with the API's
  message, a failed archive leaves the row and shows an inline message), and the
  URL-driven search survives the same product chosen twice and a search arriving
  while the page is already up, without losing Show archived; nits 2 and 3 are the
  edge cases the pass turned up.
- **Security:** clean — the products router sits behind the sign-in guard and
  `test_every_route` picks its routes up by enumeration, the `0003` migration
  enables row-level security on Postgres like the other five tables, gitleaks is
  clean, and nothing the spec does not grant leaves the API.
- **Matches the spec and plan.md:** the behavior matches `docs/specs/products.md`
  decisions 14–17 and plan.md phase by phase — prices always shown with two
  decimals, names reserved ignoring case across active and archived products,
  archive and restore with no Delete anywhere, active products only in the top-bar
  search, twelve seeded products with attribution — with nothing extra built; the
  one place the plan disagrees with the branch is nit 1.
- **Described by the spec:** clean — every behavior has a home: products.md 14–17,
  design.md (the `products` row, `/api/products`, six sections), tables.md 10, and
  the 1180px layout in look-and-feel.md 18.
- **Matches STANDARDS.md:** skipped, by request.

## Evidence

Run on this branch, all green:

- `npm run check:quick` — Prettier, ESLint (one warning, TanStack Table's
  `useReactTable`, pre-existing), `tsc`, `ty`, ruff, gitleaks, then 517 tests:
  152 backend at 99.05% coverage, 290 frontend (95.88% statements, 92.37%
  branches, 96.69% functions, 95.75% lines), 18 script.
- `npm run test:e2e` — 57 passed in 4.5 minutes.

The counts and coverage in `docs/STATUS.md` come out right against this run; its
"backend slowest 0.23s" measured 0.21s here, which is run-to-run noise.

## Noted, not a finding

The dark-mode initials-on-hover bug that ui-check found is on `main` as well —
this branch touches none of the `.user-menu-button` rules — so it wants a change
of its own.
