# Plan

## Add

- Root `package.json` scripts: `check`, `check:quick`, `check:static` (lint + secrets), `lint` / `lint:frontend` / `lint:backend`, `typecheck:backend`, `test:unit`, `secrets`, and `format` covering both Prettier and ruff format.
- `eslint.config.js`: `eslint-plugin-react-hooks` (recommended), `eslint-plugin-jsx-a11y` (recommended), `complexity: ["error", 15]` for JS and TS.
- `pyproject.toml`: `[tool.ruff.lint]` with `E4, E7, E9, F, I, C90`, `max-complexity = 15`, and pytest `addopts` with `--cov=app --cov-fail-under=80`.
- `frontend/vite.config.ts`: v8 coverage with 80% thresholds on statements, branches, functions and lines; `frontend` test script gains `--coverage`.
- `.gitleaks.toml`: extends the default rules and allows only `.env` / `.env.*` paths.
- `.npmrc`: `legacy-peer-deps=true` while `eslint-plugin-jsx-a11y` has not declared ESLint 10 support.
- Dependencies: root — `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`; frontend — `@vitest/coverage-v8`; backend (uv dev group) — `ruff`, `ty`, `pytest-cov`.
- Unit tests for the frontend pages and components that had none, to reach the coverage floor.
- `AGENTS.md` "Checks" section.

## Fix what the checks find

- Frontend: a11y on modal backdrops (`role="presentation"`, keyboard paths already present), keyboard activation for the deal card (Enter/Space), complexity in `DealForm` and `ContactForm` (initial state extracted), formatting.
- Backend: formatting, unused assignments, `lambda` assignments, import order, `ty` findings (`inserted_id` helper for SQLAlchemy's optional primary key, `MonthTotal` TypedDict for the dashboard sums).
- Reliability: `frontend/vite.config.ts` caps `test.maxWorkers: 4` — under load, Vitest's default one-fork-per-CPU starved worker startup (`npm test` runs three suites at once) and the check failed with 10 unhandled start timeouts; reproduced and verified fixed under the same load.

## Not doing

- No rule is disabled, relaxed or scoped away to make the check pass.
