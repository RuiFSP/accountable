# Accountable

SIDENOTE: this repo is part of a course by Ed Donner. If the student needs help, read `course/for_agents/`

## Where to find things

- `docs/spec.md`: the product as it stands — the first thing to read
- `docs/changes/<branch name>/`: every change gets its own folder with its `intent.md` and `plan.md`; read only the current change's folder, never another branch's
- `docs/TECH_STACK.md`: the stack
- `docs/STATUS.md`: what's done so far

Update `docs/STATUS.md` when you finish a piece of work

## Testing

- `npm test` runs everything — backend unit tests (pytest), frontend unit tests (Vitest) and end-to-end tests (Playwright) — and exits non-zero if any of them fails.
- The e2e run starts the app itself via `playwright.config.ts` (the same `npm run dev`), on its own database (`accountable-e2e.db`), so stop a running `npm run dev` first and never edit data by hand to make a test pass.
