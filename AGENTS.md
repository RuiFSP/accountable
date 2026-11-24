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
- Test runs in separate worktrees can go at once, with nothing to set: each takes a port slot and database of its own.
