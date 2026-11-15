# Plan

## 1. Lefthook pre-commit

- Add `lefthook` as a root dev dependency with a `prepare` script (`lefthook install`), so a fresh `npm install` wires the git hook.
- `lefthook.yml`: `glob_matcher: doublestar` (the default gobwas matcher does not match root-level files with `**/`), then jobs in definition order — lefthook runs them sequentially by default, so formatting lands before linting:
  - `format-frontend`: `prettier --write --ignore-unknown {staged_files}` with `stage_fixed: true`
  - `format-backend`: `ruff format {staged_files}` with `stage_fixed: true`
  - `lint-frontend` / `lint-backend`: `eslint` / `ruff check` on the staged files
  - `types-frontend` / `types-backend`: `tsc --noEmit` / `ty check backend` (whole project)
  - `secrets`: `gitleaks git --pre-commit --staged --no-banner`
- Test: planted high-entropy secrets (the low-entropy `FAKEFAKE...` fake fails gitleaks' `entropy = 3`), a badly formatted file, an unused variable, a `tsc` error, a `ty` error, a staged deletion, an ignored file (`docs/*.md`) and an empty commit.

## 2. Turn-end check hook

- One plugin, `plugins/hooks/`, registered in `opencode.jsonc` with a `checkCommand` option (default `npm run check:quick`).
- Subscribe to the `session.idle` event; for a root session of this location whose last execution `outcome` is `succeeded`, run the check command (15-minute timeout, process-group kill).
- On failure: if this session has not yet been sent a failure message since its last user prompt, set the flag and inject the output tail as a `session.synthetic` message (the agent wakes and fixes it); if the flag is already set, log and stop — that is the "block once, then let it stop" guarantee. The `prompt` hook clears the flag on the next real user prompt; a passing run clears it too.
- Skip subagent sessions (they idle after every subagent round) and skip when `git status --porcelain` matches the snapshot of the last passing check.
- Everything is logged to `logs/hooks.log` (git-ignored).

## 3. `.env` protection hook

- A `permission.hook("evaluate")` in the same plugin: deny `edit` actions whose target is `.env` or `.env.*` — except the committed templates `.env.example`, `.env.sample`, `.env.template` — and deny `shell` commands that write to them (redirects, `tee`, `rm`/`mv`, `sed -i`, `cp` with an `.env` destination).
- The shell side is pattern matching on the scanner's command text, not a shell parser: best effort, and the reason the deny message points outside OpenCode.

## Verification

- Lefthook: the seven commit scenarios above (blocked commits verified by exit 1 + unchanged HEAD, the happy path by the committed blob containing the formatted text).
- Turn-end hook: drive it across turns with `checkCommand` set to `exit 1` (injection), `exit 1` again (suppression), `true` (pass), then the real `npm run check:quick`.
- `.env` hook: `write` to `.env` (denied), `echo > .env` (denied), `write` to `.env.example` (allowed), confirmed in `logs/hooks.log`.
