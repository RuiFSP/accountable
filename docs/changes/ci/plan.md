# Plan

## Steps, in the order the user asked for

1. `actions/checkout@v7` (latest major; full versions are only required for setup-uv).
2. Install gitleaks: download the pinned release tarball (`v8.30.1`, same version as local `gitleaks version`), extract the `gitleaks` member, `sudo install` it.
3. `gitleaks dir . --no-banner` — the same scan as `npm run secrets`; it runs before Node/uv so a secret fails the run straight away (and before `npm ci`, so there is no `node_modules` to wade through).
4. `actions/setup-node@v7` with `node-version: 24` (the version this project is developed on; no `engines`/`.nvmrc` exists to read).
5. `astral-sh/setup-uv@v10.3.3` — full release tag because the project publishes no major tag — with `version: latest`.
6. `npm ci`, then `npm run check`.
7. `actions/upload-artifact@v7` with `if: failure()`, uploading `playwright-report/`, `if-no-files-found: ignore` (a failure in the lint stage means no report exists, and the job is already red).

Chrome: the runner image ships Google Chrome at `/opt/google/chrome/chrome`, which is exactly the path `playwright.config.ts` probes, so Playwright runs the suite on `channel: "chrome"` with no install step.

## The report has to exist first

Playwright's default reporter is `dot` on CI and `list` locally — neither writes a report (verified in `node_modules/playwright/lib/common/index.js`: `defaultReporter = process.env.CI ? "dot" : "list"`). `playwright.config.ts` therefore gains `reporter: [["list"], ["html", { open: "never" }]]`: the terminal output stays as it was, and an HTML report is written to `playwright-report/` for the upload step.

## Hygiene

- `permissions: contents: read`; no `secrets.*` anywhere.
- Comments explain the two non-obvious choices: the setup-uv full-version pin, and the runner-provided Chrome.

## Verification

- `actionlint` (v1.7.12, downloaded for the occasion) exits 0 on the workflow.
- `npx prettier --check .github/workflows/ci.yml` — the workflow is inside Prettier's scope.
- `npm run check:quick` runs the same gates the job runs, locally.
