This project will use the following high level technical stack:

1. Node.js 26, the current LTS (24 or later works) / TypeScript for the frontend, using React and Vite, in `frontend/`
2. Python 3.12 for the backend using uv, with FastAPI, in `backend/`, with `pyproject.toml` and `uv.lock` at the repo root

The frontend gets its data from the backend's JSON API. The backend keeps the data in Postgres on Supabase, using SQLAlchemy Core with no raw SQL, and fills it with the sample data when the database is new; the tests keep their own SQLite databases.

Prefer popular, well-supported libraries to custom code, such as for the data tables, the charts and the drag-and-drop pipeline. Don't hand-roll what a mature library does well.

Supabase provides sign-in and the database, and the app deploys to Render as one web service (see `docs/specs/running.md`). `npm start` runs the same app on this computer the way Render does, reaching Supabase over the internet; `npm run dev` is the local copy and never touches Supabase.

Commands are npm scripts in a `package.json` at the repo root, with `frontend/` as an npm workspace, so they work the same on Mac, Linux and Windows:

- `npm run dev` starts the backend and the frontend together
- `npm test` runs all the tests and fails if any test fails
- `npm run seed` resets the database to the sample data

`docs/STATUS.md` says how to run the app. `README.md` describes the product: what it does, the screenshots, the stack, the quick start, how to deploy it and where it stands, with a credit to the course repo it forked.

Testing will cover:

1. Unit tests for the frontend, using Vitest
2. Unit tests for the backend, using pytest
3. End-to-end tests of the whole app in a browser, in `e2e/`, using Playwright Test (`@playwright/test`) with the installed Google Chrome. They start the app themselves, so `npm test` needs nothing else running.

The tests use a database of their own, so running them never changes your data.
