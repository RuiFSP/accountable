# Spec: Company settings

- **Company settings**: the business's own details for the documents it will send. One page, opened from the menu under your initials, holds them for the whole team: company name, address, email and phone, tax label and rate, payment terms in days, and the prefixes for quote and invoice numbers. Anyone signed in can open the page and save changes; everyone sees the same values.
- **The fields**: the company name is required; a name of only spaces is refused. The rest can be blank. The address is one free-text block, a filled email must look like an email, and the phone is free text. A blank tax rate or payment terms value saves and shows as 0. The tax rate is a percentage from 0 to 100 with up to three decimal places, such as 8.875%; the tax label is free text, such as Sales tax or VAT. Payment terms are a whole number of days from 0 to 365. Each prefix is at most 10 characters of letters, digits and hyphens, such as QT- and INV-.
- **Checking**: the page and the backend apply the same rules. A value that is out of range or in the wrong shape — a tax rate of 150%, payment terms of 400 days, an 11-character prefix — is refused with a clear message, through the page or straight to the API, and nothing invalid is stored.
- **Last change**: the page shows who last changed the settings and when, as their email and a date and time such as "Nov 10, 2026 · 9:30 AM". A save that changes nothing leaves that line as it was.
- **Documents**: the settings are not used on documents yet. Quotes and invoices come later.

## Design decisions

Points this spec fixes:

14. **One row for the team.** One `company_settings` row holds the settings for everyone; `GET /api/settings` returns it and `PUT /api/settings` replaces it. There is no per-user copy and no second row.
15. **Settings sit in the user menu.** The page is at `/settings` and opens from the menu under your initials, with the theme choice and signing out. The top bar's five sections stay as they are.
16. **The tax rate stores three decimal places exactly.** `tax_rate_thousandths` stores the rate as an integer number of thousandths of a percent: 8.875% is 8875, 100% is 100000 and 0 is 0. SQLite and Postgres hold the same value, and the page shows the rate without rounding.
17. **Saving records who and when.** `updated_by` holds the signed-in user's email and `updated_at` the moment of the change; both move only when a stored value differs. The page shows them together, in the reader's local time.
18. **A database without settings starts as Brightloop.** Brightloop is the business the sample team works for: 1 Brightloop Plaza, Floor 12, New York, NY 10004; hello@brightloop.example; +1 555 0100; Sales tax at 8.875%; payment terms of 30 days; prefixes QT- and INV-. A database with no settings row starts with these values, with a made-up teammate as the last person to change them, and resetting the sample data reloads them.
