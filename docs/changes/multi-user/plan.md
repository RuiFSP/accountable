# Plan: sign-in, search and a user menu

Based on `docs/changes/multi-user/intent.md` (the bar) and `docs/spec.md` with its area files (the product, decisions 8 to 13 among them). No code written yet. The intent wins over the spec and the spec wins over this plan; if the build shows the spec is wrong, fix the spec in the same change and say so in `docs/STATUS.md`.

The spec fixes the behaviour and leaves the mechanics open. This plan picks them: alembic runs the migrations when the app starts, on SQLite and Postgres alike; the local sign-in issues its own tokens and needs no password (decision 13); Supabase's tokens are checked against the project's public keys; `/api/search` matches in Python so both databases answer identically by construction; and `npm start` and `npm run seed` are the only commands that read `.env`.

## Files that change

The files are grouped into ten parts. No file is in two parts, so each part can go to a different agent. A part may come back to its own files in a later phase — [Order of work](#order-of-work) says which — but no two parts ever edit the same file.

### New dependencies

Four, each with its case, and nothing else:

- **`psycopg[binary]`** (backend) — SQLAlchemy needs a driver to reach Postgres at all; the binary build needs no compiler on Render or here.
- **`alembic`** (backend) — the migrations that run when the app starts, on both databases; hand-rolled versioned schema changes for two dialects are what a migrations framework exists for.
- **`pyjwt[crypto]`** (backend, brings `cryptography`) — checks Supabase's tokens against the project's public keys locally. Signature checking is not something to hand-roll.
- **`@supabase/supabase-js`** (frontend) — sign-in, session storage and token renewal in the shared app; hand-written renewal is how apps sign people out at random. It uses only the publishable key.

`npm start` and `npm run seed` read `.env` with Node's own `parseEnv` (`node:util`), so no dotenv library is needed.

### What the parts agree on

These are the only surfaces between parts. Each part tests its side against them.

- **Settings** (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, read from the process environment only): none set → the local copy; all three → the shared app; some but not all → the backend stops at once and names the missing ones. `ACCOUNTABLE_DB` still picks the SQLite file and always means local, whatever else is set.
- **The signed-in user**: a FastAPI dependency that gives the current user's email, checked on every request. No token or a bad one → 401 `{"detail": "Sign in to use Accountable."}`. Shared copy, keys unreachable → 503 `{"detail": "Can't check your sign-in right now."}` (fail closed, never pass).
- **Local sign-in routes**, local copy only, loopback only: `GET /api/local/teammates` → `[{id, name, email}]`; `POST /api/local/sign-in` takes `{user_id}` and gives `{token, email}`. The shared copy has no such routes, whatever the request.
- **Replies**: organization, contact, deal and activity replies carry `created_by` and `updated_by`, each an email or `null`. Request bodies stay as they are; a body naming a person is ignored like any unknown field.
- **Search**: `GET /api/search?q=` → `[{kind: "organization" | "contact" | "deal", id, name}]`, ordered by name; a missing or blank `q` → 400.
- **Frontend session**: `lib/session.ts` exports the session state, `currentToken()`, `endSession(message)`, `signOut()`, `isSharedApp`, and the two sign-ins (local by teammate id, shared by email and password). It holds the local token in `localStorage` under `accountable-session`; Supabase's client keeps its own. `components/SignIn.tsx` exports `SignedIn`, which shows the sign-in screen until there's a session and then its children, and empties the query cache when a session ends.
- **Theme**: the `theme` key keeps its values `light` and `dark` and gains `system`, so a saved choice from before this change still applies.
- **Commands**: only `npm start` and `npm run seed` read `.env`. Every other command — `npm run dev`, `npm test`, `npm run check` — runs the local copy even when `.env` is full.

### Part A — settings, database and migrations (backend)

| File | Change |
|---|---|
| `pyproject.toml`, `uv.lock` | Add `psycopg[binary]`, `alembic`, `pyjwt[crypto]`. Both Python packages go in here, so only this part touches the lock file |
| `backend/app/settings.py` | New. The three names, none/all/partial as agreed above |
| `backend/app/db.py` | The engine follows the settings: `postgresql+psycopg` with pre-ping (a connection dropped while Render slept is not reused), or today's SQLite. `prepare()` runs `alembic upgrade head`; a database built before this change has its tables but no `alembic_version`, so it is stamped at the baseline first and upgraded from there — its data survives. `repair_links` and seed-if-new stay |
| `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_first_tables.py`, `0002_who.py` | New. `0001` is today's schema exactly; `0002` adds `created_by` and `updated_by` to the four tables and, on Postgres only, turns on row-level security for every table |
| `backend/tests/test_settings.py`, `backend/tests/test_migrations.py` | New. See [Proof](#proof) |

### Part B — sign-in on the backend

| File | Change |
|---|---|
| `backend/app/auth.py` | New. The check for both copies and the dependency above. Local: signs HS256 tokens for the teammates with a key generated at start-up and kept in memory, accepts them only from loopback, and serves the two `/local` routes. Shared: accepts only ES256 and RS256 tokens from the project's key set, with the project's issuer, the `authenticated` audience, an expiry and an email claim; the keys are fetched once and kept until an unknown key id turns up |
| `backend/app/main.py` | Builds the app for the copy the settings name, so tests can build the shared copy on their own SQLite database with stand-in keys. Every `/api` router gets the dependency; the `/local` routes only in the local copy. The shared copy serves `frontend/dist`, with the page for any other address outside `/api` and a JSON 404 inside it. The lifespan runs `prepare()`. In Phase 2, one line: include the search router |
| `backend/tests/conftest.py` | The `client` fixture signs in as a made-up teammate, so the existing suite keeps running; helpers to sign in as someone else and to build the shared copy with stand-in keys |
| `backend/tests/test_auth.py`, `backend/tests/test_every_route.py` | New. See [Proof](#proof) |

### Part C — who added and who changed (backend)

| File | Change |
|---|---|
| `backend/app/routes/organizations.py`, `contacts.py`, `deals.py`, `activities.py` | An add sets `created_by` and `updated_by` from the signed-in user; a save sets `updated_by` only when a stored value actually changes; a stage move sets it; renumbering other cards and blanking a link after a delete do not. Replies carry the two emails |
| `backend/app/seed.py` | Four made-up teammates, one with only an email so the email fallback has a case; every sample record and stage change goes down to a teammate, some last changed by another. A reset drops every table including `alembic_version` and rebuilds through the migrations, so the version table never disagrees with the schema |
| `backend/tests/test_who.py` | New. Every change the intent counts, and the ones it doesn't |
| `backend/tests/test_seed.py`, `test_reset.py`, `test_crud.py`, `test_cascade.py`, `test_stage_move.py`, `test_dashboard.py` | Updated where a reply or an exact column list changes |

`backend/app/stats.py` and `backend/app/routes/common.py` are untouched: the dashboard needs no attribution and the existence checks stay as they are.

### Part D — search (backend)

| File | Change |
|---|---|
| `backend/app/routes/search.py` | New. `GET /api/search?q=`: fetches id and name from the three tables, matches in Python with `casefold` and returns the three kinds in name order — the same answer on SQLite and Postgres by construction, no LIKE or locale differences to chase. Blank `q` → 400 |
| `backend/tests/test_search.py` | New. See [Proof](#proof) |

### Part E — session and the sign-in screen (frontend)

| File | Change |
|---|---|
| `frontend/package.json`, `frontend/package-lock.json` | `@supabase/supabase-js` |
| `frontend/src/lib/session.ts` | New, as agreed above: which copy from whether the Supabase settings were built in; local token in `localStorage`; shared app through Supabase's client, with its errors mapped to plain copy |
| `frontend/src/lib/session.test.ts` | New |
| `frontend/src/components/SignIn.tsx` | New. `SignedIn`, and both sign-in screens: the shared app's email and password fields, the local copy's teammate buttons. Keeps the address the app was opened at |
| `frontend/src/components/SignIn.test.tsx` | New |
| `frontend/src/api/client.ts` | Adds `Authorization` when a token exists — never when it doesn't, so a signed-out request is just today's request — and a 401 ends the session. Reply types gain `created_by` / `updated_by`. In Phase 2, `api.search` |
| `frontend/src/api/client.test.ts`, `client.extra.test.ts` | The header with and without a token, the 401, the new fields |

### Part F — who added, on screen (frontend)

| File | Change |
|---|---|
| `frontend/src/pages/Organization.tsx`, `Contact.tsx`, `Deal.tsx` | "Added by" and "Last changed by" lines in the detail grid, each omitted when there's no email for it |
| `frontend/src/components/Timeline.tsx` | Each entry shows who added it, beside when |
| Their `*.test.tsx` files | The lines with and without a name |

### Part G — shell: gate, search box, user menu, theme (frontend)

| File | Change |
|---|---|
| `frontend/src/routes.tsx` | Wraps the router in `SignedIn` (Phase 1); the search box in the top bar between the nav and the actions (Phase 2); the menu in place of the theme toggle (Phase 3). "New deal" stays where it is |
| `frontend/src/routes.test.tsx`, `routes.extra.test.tsx` | Signed out, any address shows the sign-in screen; the top bar holds the search box and the menu and no dark-mode switch; the `api` mock gains whatever the new calls need |
| `frontend/src/components/SearchBox.tsx` | New, with `SearchBox.test.tsx`: asks as you type after a short pause, ignores a reply that arrives late, lists matches grouped by kind with the kind shown, opens one on click or Enter, Escape closes, an empty box clears |
| `frontend/src/components/UserMenu.tsx` | New, with `UserMenu.test.tsx`: the initials button with an accessible name, then the menu — the email, Light / Dark / System with the current one marked, and Sign out |
| `frontend/src/lib/theme.ts`, `frontend/src/lib/theme.test.ts` | `system` joins `light` and `dark` under the same key; while System is chosen the mode follows the device as it changes; an unknown value or denied storage still gives Light |
| `frontend/index.html` | The early script handles System too, asking `prefers-color-scheme`, so a System reload never flashes the wrong mode |
| `frontend/src/styles/brand.css` | The menu, the results panel and the sign-in panel, tokens only |

### Part H — running: npm start, seed and Render (root)

| File | Change |
|---|---|
| `scripts/env.mjs` | New. Reads `.env` with `parseEnv` and splits what each command may see: only `start` and `seed` pass the three settings on, and `ACCOUNTABLE_DB` always wins and means local |
| `scripts/start.mjs` | New. `npm start`: name any missing setting and stop; build the frontend with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — never `DATABASE_URL`; run the backend the way Render does, at `http://localhost:8000` |
| `scripts/seed.mjs` | New. `npm run seed`: the same target rules, spawning today's seed command; the confirmation names which database it will wipe — the local file or Supabase |
| `scripts/env.test.mjs`, `scripts/start.test.mjs` | New, through `node --test`: the split of environments, and the build never seeing `DATABASE_URL` |
| `package.json` | `start`, and `test:scripts` added to `npm test` and to `test:unit` so both checks run the script tests |
| `render.yaml` | New, in Phase 4. One free web service: build with `uv sync`, `npm ci` and the Vite build carrying the two `VITE_` settings; start the backend on `$PORT` with one worker; `healthCheckPath: /` because `/api` answers 401; `PYTHON_VERSION` 3.12; `TZ` for the team's time zone, since Render runs UTC and dates are computed on the server; the region nearest the Supabase project; the three settings named with `sync: false`, values entered in Render and never written in the file |

### Part I — end-to-end (`e2e/`)

| File | Change |
|---|---|
| `playwright.config.ts` | The readiness check moves off `/api/organizations`, which now answers 401, to the local teammates route |
| `e2e/helpers.ts` | Signs in and hands the token to a spec's `request` calls; a guard fails any test that makes a request leaving the machine; the seed spawn keeps `ACCOUNTABLE_DB` |
| `e2e/sign-in.spec.ts`, `e2e/security.spec.ts`, `e2e/search.spec.ts`, `e2e/menu.spec.ts` | New. See [Proof](#proof) |
| `e2e/theme.spec.ts` | Deleted; its tests move into `menu.spec.ts`, switching the theme through the menu |
| `e2e/startup.spec.ts`, `crud.spec.ts`, `contacts.spec.ts`, `pipeline.spec.ts`, `activities.spec.ts`, `dashboard.spec.ts`, `screenshots.spec.ts` | Sign in first; the screenshots helper switches modes through the menu |

### Part J — docs

| File | Change |
|---|---|
| `docs/STATUS.md` | Progress at the end of each phase; how to run both copies; the shared setup — the user added in Supabase, sign-ups off; the deploy |
| `.opencode/agents/ui-check.md` | Signs in by choosing a made-up teammate and switches the theme through the menu; no toggle to click |
| `README.md` | The quick start gains `npm start` |
| `docs/spec.md`, `docs/specs/*.md`, this plan | Only where the build shows the spec wrong. Part J owns these files, so no two agents edit a spec file |

## Order of work

Four phases. Each phase ends with `npm run check` passing. Within a phase the parts run side by side against the agreements above, and their work is merged before the next phase starts.

### Phase 1 — sign-in and the database

1. Part A lands the settings, the engine, both migrations and the baseline handling first; everything else builds on them.
2. Part B: `auth.py`, then `main.py`, then `conftest.py` so the existing backend tests run signed in, then the new tests.
3. Part C: the attribution writes and replies, then the teammates and sample attribution, then `test_who.py` and the updated suites.
4. Part E: `session.ts`, `SignIn.tsx`, the client's header and 401. Part G wraps the router in `SignedIn`, so the app is gated.
5. Part F: the record pages and timelines, once Part C's replies are in.
6. Part H: `env.mjs`, `start.mjs`, `seed.mjs` and the script tests, so `npm start` exists and e2e's seed keeps its own database.
7. Part I: every spec signs in first and the outside-request guard goes in.
8. Part J: the setup notes in `docs/STATUS.md`.
9. **By hand, with the project owner.** `npm run dev`: choose a teammate, walk every screen. `npm start` against Supabase: the migrations run on the empty project, the sample data lands, row-level security is on for every table in Supabase's dashboard, sign in as the owner's user, a wrong password says so, then every screen and every kind of save. `npm run seed` once, to see it name Supabase in its confirmation.

Done when: `npm run check` passes; signed out, every page shows the sign-in screen and every API route refuses; every record and activity shows who added it; `npm start` walks the criteria against Supabase.

### Phase 2 — search

1. Part D: the route and its tests. Part B: the one line in `main.py`.
2. Part E: `api.search`. Part G: `SearchBox` in the top bar, with its tests.
3. Part I: `search.spec.ts`.
4. **By hand:** the same query against both copies — a part of a name in another case, an accented name, `%` and `_` — same results, same order.

Done when: `npm run check` passes and search finds an organization, a contact and a deal by part of a name in any case on both copies.

### Phase 3 — the user menu

1. Part G: `theme.ts` and the early script handle System, then `UserMenu`, then the menu in place of the toggle; `theme.spec.ts`'s tests move into `menu.spec.ts` and the old file goes.
2. Part E and Part I: the sign-out tests, which needed the menu to exist.
3. Part J: `.opencode/agents/ui-check.md`.

Done when: `npm run check` passes and the menu's theme choice is remembered with System following the device.

### Phase 4 — finish

1. Part H: `render.yaml`. Part J: `README.md`, `docs/STATUS.md` and the spec brought up to date with what was built.
2. `npm run check` twice — with the settings in `.env`, and with `.env` moved aside by the project owner. Both pass and neither reaches Supabase.
3. Every unit test timed: each one under a second on this computer (intent constraint).
4. ui-check on the app from `npm run dev`, and the reviewer on the branch; fix what they find.
5. The intent's success criteria by hand, below.

The first deploy to Render happens once `main` has this change: the owner sets up the Blueprint from `render.yaml` and the checks run again on the `onrender.com` address.

## Risks

Most damaging first.

1. **A test or a local command reaches the team's data.** `.env` sits one mistake away from `npm test`, `npm run dev` and e2e. Three guards: only `start` and `seed` read `.env` and `env.test.mjs` proves the split; `ACCOUNTABLE_DB` always means local; every end-to-end test fails on a request that leaves the machine. Phase 4 runs `npm run check` with `.env` in place to prove it.
2. **`npm run seed` wipes Supabase.** It must be able to (intent), so the confirmation names the target out loud — the local file or the Supabase host — before anything is dropped. Phase 1.
3. **`npm start` changes the real database.** Its migrations run on whatever `DATABASE_URL` names and there is no undo. The agent never runs it without the owner saying so, and the first run is against the project as it stands. Phase 1.
4. **The token check lets in something it shouldn't.** The usual mistakes: accepting HS256 in the shared copy (which would let a public key act as a secret), another project's tokens, anonymous users, or failing open when the keys can't be fetched. `test_auth.py` has a token for each, and unreachable keys give the 503, never a pass. Phase 1.
5. **The Supabase project is on shared-secret JWTs.** Then there is no public key set to check against, and sign-in fails closed — visible the first time `npm start` is walked. The fix is in the project's dashboard (asymmetric signing keys); if the project can't do that, the fallback is asking Supabase to check each token, which adds `httpx` as a fifth dependency with its own case. Phase 1.
6. **Code that only ever ran on SQLite fails on Postgres.** The tests never touch Postgres, so it shows only by hand: untyped blank columns in a union, booleans compared with 0 and 1, grouped queries that select beyond the group, name ordering under a different collation. Search sidesteps its share by matching in Python. The Phase 1 walk on Supabase does every screen and every kind of save before later phases build on it. Phase 1.
7. **A database built before this change doesn't upgrade.** It has tables and no `alembic_version`; running the migrations straight would fail on the first `CREATE TABLE`. `prepare()` stamps the baseline first, and `test_migrations.py` upgrades a database with data in it and checks every row survives. Phase 1.
8. **A secret ends up in the page.** Only the two `VITE_` settings are built in and `start.test.mjs` checks the build's environment; after the first `npm start`, `frontend/dist` is searched for the database host. If gitleaks flags the publishable key there — it scans the folder, git-ignored or not — ask the owner before touching `.gitleaks.toml`, because that loosens a check. Phase 1 and 4.
9. **The existing tests stop at a 401.** Most backend tests and every end-to-end test call the API. Signing in through `conftest.py`'s fixture and e2e's helper keeps nearly all of them as they are; the rest get a token by hand, and `test_seed.py`'s exact column lists gain the two new ones. Phase 1.
10. **Readiness checks hang.** Playwright waits on an address that now answers 401, and Render's health check would do the same. The config waits on the local teammates route, and `render.yaml` checks `/`. Missed, every e2e run hangs 60 seconds and then fails. Phase 1 and 4.
11. **The theme flashes or forgets.** The early script must handle System, an old saved `light` or `dark` must carry over, and the listener must only run while System is chosen. `theme.test.ts` runs the script with the device stood in, and `menu.spec.ts` holds the page back on a dark device to check it is already dark. Phase 3.
12. **Two things the phases can't see: drift and slowness.** Parts built side by side can read an agreement differently — each part tests its own side against the agreements and the checks run at the end of each phase, not only at the end. And generating keys, calling Supabase's client stood in, or fetching per keystroke can push a unit test past a second — keys are made once per session, Supabase's client is mocked, and Phase 4 reads the slow-test list. All phases.

## Proof

`npm run check` runs everything below and fails if anything fails. The existing tests must still pass, changed only where the parts list says so.

The intent's success criteria:

1. `npm run check` passes and never touches Supabase, with or without the settings in `.env`: the whole suite twice in Phase 4, the environment split in `env.test.mjs`, and e2e's outside-request guard.
2. Signed out, every page shows the sign-in screen and every API route refuses: `test_every_route.py` in both copies, `sign-in.spec.ts` and `security.spec.ts`.
3. Every record and activity shows who added it and who last changed it: `test_who.py`, the page and timeline tests, and the end-to-end walk through the app.
4. Search finds an organization, a contact and a deal by part of a name, in any case, and each table's own search still works: `test_search.py`, `SearchBox.test.tsx`, `search.spec.ts`, and the existing crud coverage for the per-table box.
5. The menu's theme choice is remembered and System follows the device's setting: `theme.test.ts`, `UserMenu.test.tsx` and `menu.spec.ts`.
6. The built app runs on this computer the way Render runs it, signed in against Supabase: `test_built_app.py`, `start.test.mjs`, and `npm start` by hand.

### Unit tests: backend (pytest)

- `test_settings.py` — none of the three settings gives the local copy, all three the shared app; some but not all stops the backend naming the missing ones; `ACCOUNTABLE_DB` still means the local file.
- `test_migrations.py` — both migrations build exactly the schema the tables define; a database built before this change upgrades and keeps every row; on Postgres's SQL, written out offline, `0002` adds the two columns and turns on row-level security for every table.
- `test_auth.py` — local: the teammates route lists the four, sign-in gives a token that opens the API, an unknown id is refused, a local token is refused from any other host. Shared, with stand-in keys: a good token works and its email becomes the user; an unknown key id fetches the keys once more; keys that can't be fetched give the 503; the `/local` routes aren't there. Refused in both: no token, an expired one, one for another issuer or audience, an anonymous one, and in the shared copy one signed HS256 with the public key.
- `test_every_route.py` — every route the app has, taken from the app, in both copies: 401 with the message without a token and with each bad token above.
- `test_who.py` — an add sets both; a save that changes a value sets the last-changed one and a save that changes nothing doesn't; a stage move, a board move, a follow-up tick and a won deal's contact each count; renumbering the other cards and blanking a link after a delete don't; a body naming a person changes nothing; replies carry the emails and old records give `null`.
- `test_search.py` — part of a name, any case, an accented name, `%` and `_` matching only themselves, blank `q` refused, the three kinds in name order.
- `test_seed.py` and `test_reset.py` — the four teammates, one with only an email; every sample record and stage change attributed, some last changed by another; a reset leaves the version table and the schema agreeing; the exact column lists include `created_by` and `updated_by`.
- `test_built_app.py` — with a stand-in `frontend/dist`: a built file is served, an unknown address gets the page, an unknown `/api` address gets a JSON 404, and `..` can't reach outside the folder; the local copy serves no built frontend.
- The updated `test_crud.py`, `test_cascade.py`, `test_stage_move.py`, `test_dashboard.py` — the same behaviour as before, through replies that now carry two more fields.

### Unit tests: frontend (Vitest)

- `lib/session.test.ts` — which copy from the settings built in; local: signing in keeps the token, a reload finds it, signing out drops it; shared, with Supabase's client stood in: a wrong password and an unreachable service each give their message, and the client ending the session ends ours.
- `api/client.test.ts`, `client.extra.test.ts` — a request carries the token only when there is one; a 401 ends the session; replies type `created_by` / `updated_by`.
- `components/SignIn.test.tsx` — shared: labeled fields, the error shown, Enter signs in, the button works once however fast it's pressed; local: the four teammates with initials and emails, clicking one signs in; `SignedIn` shows the screen until there's a session, keeps the address, and ending a session empties the query cache.
- `lib/theme.test.ts` — Light, Dark and System saved and read back; an old saved Light or Dark carries over; no choice, an unknown one and storage that throws give Light; System follows the device and switches when it changes; the early script in `index.html`, run with the device stood in, agrees with `theme.ts` for each case.
- `components/UserMenu.test.tsx` — the button shows the initials and names its person; the menu shows the email, the three themes with the current one marked, and Sign out; choosing applies and closes; Escape returns focus to the button.
- `components/SearchBox.test.tsx` — nothing asked before the pause, a late reply never replaces a newer one, matches grouped with their kind, click and Enter open one, Escape closes, an empty box clears.
- `routes.test.tsx`, `routes.extra.test.tsx` — signed out, any address shows the sign-in screen with no top bar; signed in, the bar holds the nav, the search box and the menu and no dark-mode switch, on all eight routes; "New deal" still opens its dialog.
- The page and timeline tests in Part F — "Added by" and "Last changed by" with an email, the second line gone when there is none, and an entry showing who added it.

### End-to-end tests (Playwright, `e2e/`)

All run on the local copy: every spec signs in through the real sign-in screen or the local route, and the guard fails any test whose requests leave the machine.

- `sign-in.spec.ts` — signed out, the dashboard, a deep link and an unknown address each show the sign-in screen with no top bar; the screen lists the four teammates; choosing one opens the address the app was opened at; a reload stays signed in; signing out returns to the dashboard signed out; a token the backend refuses brings the screen back with the session-ended message.
- `security.spec.ts` — a sample of `/api` requests without a token each get the 401 and its message; the existing checks still pass; no console errors.
- `search.spec.ts` — an organization, a contact and a deal found by part of a name in another case, opened by click and by keyboard; the box clears on Escape; the per-table search still works.
- `menu.spec.ts` — the menu is on every route and a record's page and names its person; Light, Dark and System each apply at once and survive a reload; System follows the device, emulated, while the page is open; with System on a dark device the page is dark before the app runs; sign out from the menu; the tests carried over from `theme.spec.ts` — the dialogs, charts and dark-mode sweep, now switched through the menu.
- The attribution walk, folded into `crud.spec.ts` and `activities.spec.ts` — a new record shows who added it, an edit by another teammate shows who last changed it, a logged activity and a moved deal show who did it.
- The existing specs, signing in first and otherwise unchanged: `startup`, `contacts`, `pipeline`, `dashboard`, `screenshots`.

### By hand

- `npm run dev`: choose a teammate and walk every screen; the backend restarting signs you out, which the local copy's in-memory key makes expected rather than a bug.
- `npm run check` with the settings in `.env` and with `.env` moved aside — both green, neither reaching Supabase.
- `npm start` with the owner, against Supabase: migrations from empty, sample data, row-level security visible in Supabase's dashboard, sign in as the owner's user, a wrong password, every screen and every kind of save, search matching the local copy including accents, the theme menu.
- ui-check on the app from `npm run dev`, and the reviewer on the branch.
- After the merge, the owner's first Render deploy: `render.yaml`'s region is the one nearest the Supabase project, `TZ` is the team's zone, and the `onrender.com` address passes the same walk, including the first visit after the app has slept.
