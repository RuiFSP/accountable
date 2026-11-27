# Spec: Sign-in

Everyone signs in before they see anything, and the way the app runs decides how: the way Render runs, an email and a password through Supabase Auth; on this computer, no password at all — the sign-in screen lists the made-up teammates that come with the sample data, and clicking one signs you in. Once signed in, a refresh keeps you signed in until you sign out — though on this computer a working session lasts twelve hours and a restart of its backend ends it early, so you pick a teammate again. Signed out, every page shows the sign-in screen and every API route refuses. Signed in, everything works as it did before. There is no sign-up page — people are added in Supabase's dashboard.

- **The user**: on every request the backend checks the sign-in and takes the user from what it checked, never from the request. In Supabase mode the browser holds only the publishable key and the token rides on every API request. The local sign-in's routes exist only on this computer; the app the way Render runs has no such route, whatever the request.
- **Who added it, who changed it**: every organization, contact, deal, activity, product, quote and bill records who added it and who last changed it. Both show on the record's detail page as the user's email — on a quote's page too — and products have no detail page, so both show in the Products table, and a bill has none either, so both show in its add and edit dialog. The company settings record who last changed them and when.
- **The menu under your initials**: Settings, the theme — light, dark or system — and signing out.
- **Everyone can do everything.** There are no roles or permissions; the team shares one set of records and one set of company settings.

## Design decisions

Points this spec fixes:

8. **The user comes from the check, never from the request.** On every request the backend verifies the sign-in — the Supabase token the way Render runs, the local sign-in on this computer — and takes the user from it; nothing in the request body or the headers decides who is acting.
9. **No sign-up page.** The app only signs people in. People are added in Supabase's dashboard, and the teammates on this computer come with the sample data.
13. **No password on this computer.** The local sign-in lists the made-up teammates and clicking one signs you in, with no password to type or store. Its routes exist only on this computer, and the app the way Render runs has no such screen or route.
