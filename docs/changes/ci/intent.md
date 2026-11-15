# Intent

One CI workflow, `.github/workflows/ci.yml`, with a single job named `check` that runs on every push to any branch:

- Install gitleaks and scan the whole repo first, so a leaked secret fails the run before anything else is set up.
- Then install Node and uv, and run `npm run check` — using the Google Chrome that GitHub's runner already ships (no browser install step).
- If the run fails, upload the Playwright report.
- No secrets: the workflow must run without any repository secrets configured.

Constraint from the user: `astral-sh/setup-uv` has no major-version tag (no `v10`), so it is pinned to the full version number of its latest release, and it is told to install the latest uv.

Success looks like: the workflow passes actionlint and the repo's own Prettier gate, and every step mirrors a command the checks already define (`gitleaks dir .` is `npm run secrets`, the job body is `npm run check`).
