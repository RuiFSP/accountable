# Intent

Three hooks, each tested:

1. A lefthook pre-commit hook that formats the staged files, then runs lint, type checks and gitleaks — no tests, so it stays quick.
2. An OpenCode hook that runs `npm run check:quick` when the coding agent finishes a turn and sends any failure back to the agent to fix. It must block (wake the agent) at most once per round and then let it stop, so it can never loop forever.
3. An OpenCode hook that blocks any agent edit to `.env`.

Rules are the same as for the checks: nothing weakened. If a hook turns out not to suit the project, that is a question for the user.

Success looks like: all three hooks installed and demonstrated working, with the test method reported for each.
