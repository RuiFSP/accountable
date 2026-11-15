# Intent

Add one command that proves the branch is safe to merge, plus the two commands that make fixing it pleasant:

- `npm run check` runs every gate and fails if any fails: Prettier and ESLint with the recommended TypeScript, React Hooks and accessibility rules; ruff format and ruff check for the backend; a cyclomatic complexity cap of 15 per function (ESLint `complexity`, ruff `C901`); `tsc` for the frontend and `ty` for the backend; gitleaks across the repo, allowing the git-ignored `.env`; and `npm test` with unit-test coverage of at least 80%.
- `npm run check:quick` runs the same checks without the end-to-end tests, for the inner loop.
- `npm run format` fixes formatting (Prettier and ruff format).

Rules are strengthened, never weakened. If a rule turns out not to suit the project, that is a question for the user, not a silent exception.

Success looks like: `npm run check` green from a clean checkout, documented in `AGENTS.md`.
