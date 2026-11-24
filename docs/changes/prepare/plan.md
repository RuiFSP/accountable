# Plan

## Files that change

- New `backend/app/records.py`: `read_or_404`, `require_exists`, `stamp_created` and `stamp_updated`, moved out of the record routes.
- `backend/app/routes/organizations.py`, `contacts.py`, `deals.py`, `activities.py`: use the shared helpers; their own `_read` copies and attribution blocks go. `routes/common.py` goes with them.
- New `frontend/src/components/ContactForm.tsx`, `OrganizationForm.tsx` and `RecordAttribution.tsx`: the two forms move out of their pages, and the "Added by" / "Last changed by" lines the three detail pages repeat become one component.
- `frontend/src/pages/Contacts.tsx`, `Organizations.tsx`, `Contact.tsx`, `Organization.tsx`, `Deal.tsx`: import the shared components and keep only the area's own content.
- `docs/spec.md`, `docs/specs/design.md`, `docs/STATUS.md`: describe the new shared homes and record the change.

## Order of work

1. Backend helpers and the four record routes; delete `routes/common.py`.
2. Frontend forms and attribution component; update the pages.
3. Docs, then the checks.

## Risks

- The attribution rule must stay exactly as it is: an add sets both emails, a save sets only `updated_by` and only for a real change, a stage move still credits the move but not the renumbered cards around it, and deleting/blanking links still changes nobody.
- The forms must keep their labels, messages, trim rules and add/edit titles, because page tests and the end-to-end suite assert them.
- `ActivityForm` stays inside `Timeline.tsx`; only the repeated detail lines and page-owned forms move.

## Proof

- Existing backend `test_who.py`, `test_crud.py`, `test_stage_move.py`, `test_cascade.py` and route sweep cover the same behaviour through the new helpers.
- Existing page tests for contacts, organizations and deals cover the moved forms and attribution lines.
- `npm run check` green, with the test counts taken from its output.
