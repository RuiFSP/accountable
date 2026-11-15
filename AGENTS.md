# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/spec.md`: the product as it stands — the first thing to read
- `docs/changes/<branch name>/`: every change gets its own folder with its `intent.md` and `plan.md`; read only the current change's folder, never another branch's
- `docs/STANDARDS.md`: how we write code here
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far

Update `docs/STATUS.md` when you finish a piece of work

## Checks

- `npm run check` runs every gate and fails if any of them fails: Prettier and ESLint (recommended TypeScript, React Hooks and accessibility rules), ruff format and ruff check for the backend, cyclomatic complexity of at most 15 per function (ESLint `complexity`, ruff `C901`), type checks (`tsc` for the frontend, `ty` for the backend), gitleaks across the repo (the git-ignored `.env` is allowed), and `npm test` with unit-test coverage of at least 80%.
- `npm run check:quick` runs the same checks without the end-to-end tests.
- `npm run format` fixes the formatting (Prettier and ruff format).
- A lefthook pre-commit hook (installed by `npm install` through the `prepare` script) formats the staged files, then runs lint, type checks and gitleaks; it skips the tests so commits stay quick.
- The `plugins/hooks/` OpenCode plugin runs `npm run check:quick` when a turn in this repo ends and sends a failing run back to the agent — at most once per user prompt, so it can't loop forever — and denies agent edits to `.env` (committed templates such as `.env.example` stay editable). Both hooks log to `logs/hooks.log`.

## Testing

- `npm test` runs everything — backend unit tests (pytest), frontend unit tests (Vitest) and end-to-end tests (Playwright) — and exits non-zero if any of them fails.
- The e2e run starts the app itself via `playwright.config.ts` (the same `npm run dev`), on its own database (`accountable-e2e.db`), so stop a running `npm run dev` first and never edit data by hand to make a test pass.
