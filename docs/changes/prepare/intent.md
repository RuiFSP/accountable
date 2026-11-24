# Intent

Products and company settings add two new business areas beside the CRM ones. Before they start, move the code every area needs out of the area files, so a new area never has to import another area's code.

- Backend: who added a record and who last changed it, including a save crediting the changer only when a stored value actually changed, plus the read-one-row-or-404 helper. They live above the route files and every record route uses them.
- Frontend: shared forms and the attribution lines a detail page repeats live in `components/`; generic helpers live in `lib/`; `pages/` holds only each area's own pages.
- Nothing the app does changes: the same replies, pages and messages.
- Update the spec and design where they describe the layout, update any test that notices the move, and pass `npm run check`.
