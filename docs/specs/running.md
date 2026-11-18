# Spec: Running it

- One documented command starts it, working on Mac, Linux and Windows; it runs in the latest Chrome or Edge. There are two ways to run it: `npm run dev` runs it on this computer with the sample data, signing in as one of the made-up teammates, and never touches Supabase; `npm start` builds the frontend and runs it the way Render does, against Supabase, which needs an internet connection. The tests run on this computer, without one.
- Every change is kept: it's still there after a browser refresh, and every time the app starts it shows every change made before.
- One documented command resets the data to the sample data, to start again from scratch; it asks for confirmation before wiping anything.

## Sample data

Accountable comes with realistic sample data, so every screen looks alive the first time it starts: organizations across several industries, contacts at every status, deals at every stage (including deals won and lost over the past months, deals expected to close in the months ahead and a few running late), and activities with some follow-ups due soon and some overdue. Every sample record shows which made-up teammate added it, and some show a different teammate as who last changed them.

When Supabase is empty, the app seeds it with this sample data the way it seeds a new database, and `npm run seed` drops and reloads it there. The contents of an old local SQLite file are never migrated.

## Deployed

- The app deploys to Render's free plan as one web service: FastAPI serves the built frontend and the API, migrations run when it starts, and it answers at its onrender.com address.
- A `render.yaml` describes it. The Supabase settings are entered in Render, not written in the file; locally they live in `.env`.

## Design decisions

Points this spec fixes:

12. **One web service, settings in Render.** Render runs one web service that serves the built frontend and the API and runs the migrations on start, described by `render.yaml`; the Supabase settings are entered in Render and never written into the file.
