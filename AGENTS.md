# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/spec.md`: the product as it stands — the first thing to read: a short summary of the whole product with an index
- `docs/specs/`: the detail, one file per product area — read only the area files the current change touches, and keep the spec files that a change affects up to date in the same change
- `docs/changes/<branch name>/`: every change gets its own folder with its `intent.md` and `plan.md`; read only the current change's folder, never another branch's
- `docs/STANDARDS.md`: how we write code here
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far
- `docs/IMPROVE.md`: follow at Deploy, after the review fixes and before the merge

Update `docs/STATUS.md` when you finish a piece of work

## Numbers in docs

A count or coverage figure written into `docs/` — test totals, coverage percentages, how many literals a file has — comes from the run output or from counting the code, never from memory. The dark-mode change wrote both wrong and review caught them: `docs/changes/dark-mode/plan.md` said seven hex literals in `Dashboard.tsx` where there were eight, and `docs/STATUS.md` labelled 96.85% "statements" when it was functions.

## Dates and times

- Give every time column one convention and say which it is: `happened_at` holds local wall-clock time, `company_settings.updated_at` holds UTC. A UTC moment goes into a `DateTime(timezone=True)` column, or into a naive column as `datetime.now(UTC).replace(tzinfo=None)`; an aware value written to a naive column is converted against the database session's timezone on Postgres and silently loses its offset on SQLite.
- A test that checks a date uses the clock the value was made from: compare a UTC moment with `datetime.now(UTC).date()`, never `date.today()`, or the test flips whenever the machine's local date differs from the UTC date.

## Spec before plan

`docs/spec.md` and the area files are the product's authority; a plan, a test or the build does not settle a disagreement with them in its own favour. Surface the conflict and either build what the spec says or change the spec first, with the person. The products change's plan read "dollars and cents" as whole dollars, the tests followed the plan and every gate stayed green; the review caught the price rule broken.

## URL state

A route's query string can change while the page stays mounted, including navigating to the same address again. Drive the state from the location, or key the work on it, rather than seeding it once, and test it from the same route, not only on arrival. The MVP's New deal action was dead on the deals page, and the products top-bar link missed the same product chosen twice.

## Checks

- `npm run check` runs every gate and fails if any of them fails: Prettier and ESLint (recommended TypeScript, React Hooks and accessibility rules), ruff format and ruff check for the backend, cyclomatic complexity of at most 15 per function (ESLint `complexity`, ruff `C901`), type checks (`tsc` for the frontend, `ty` for the backend), gitleaks across the repo (the git-ignored `.env` is allowed), and `npm test` with unit-test coverage of at least 80%.
- `npm run check:quick` runs the same checks without the end-to-end tests.
- `npm run format` fixes the formatting (Prettier and ruff format).
- A lefthook pre-commit hook (installed by `npm install` through the `prepare` script) formats the staged files, then runs lint, type checks and gitleaks; it skips the tests so commits stay quick.
- The `plugins/hooks/` OpenCode plugin runs `npm run check:quick` when a turn in this repo ends and sends a failing run back to the agent — at most once per user prompt, so it can't loop forever — and denies agent edits to `.env` (committed templates such as `.env.example` stay editable). Both hooks log to `logs/hooks.log`.
- `.github/workflows/ci.yml` runs the same gates on every push to any branch: gitleaks across the repo first, so a leaked secret fails the run before anything is installed, then `npm run check` with the Google Chrome GitHub's runner already ships. It needs no repository secrets and uploads the Playwright report when it fails.

## Testing

- `npm test` runs everything — backend unit tests (pytest), frontend unit tests (Vitest) and end-to-end tests (Playwright) — and exits non-zero if any of them fails.
- The e2e run starts its own API and Vite servers, on ports no other test run is using, and a temporary database of its own (`scripts/e2e.mjs` and `playwright.config.ts`), so a running `npm run dev` is not in its way. Never edit data by hand to make a test pass.
- For every write, test the path where nothing changes as well as the path where a value changes: a no-op save still leaves the screen showing what the server stored.
- Test the shape that can break the rule, not the shape that runs: a count needs two things to count, a refusal needs the same record twice rather than a second different one, and a layout needs past one screenful. The quotes review found all three with every gate green — one quote on a deal proved `This deal has 1 quote`, one line of an archived product never tried a second line of it, and a three-line PDF never reached a page break.
- Test runs in separate worktrees can share this computer, with nothing to set: each takes a port slot and database of its own. No more than two go at once; the rest wait for a turn and print why, with how many runs are ahead. Let a waiting run wait rather than stopping it, and start `npm run check` with a generous timeout or in the background, because the wait can outlast a short one.
