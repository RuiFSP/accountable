# Intent: prepare for quotes, invoices and bills

Quotes, invoices and bills are built side by side, each in its own worktree. They need some of the same code, and changing it three times would mean three conflicts and three explanations of the same rule.

## Proposed outcome

Make once, before the three features start:

- The money sums both documents use: a line's amount, the subtotal, the tax once on the subtotal and the total, with the same cases on both sides.
- The counter that gives a quote or an invoice its next number, and the company settings both read.
- A delete guard for records another area points at, so a document never holds a missing deal or organization.
- The panels later areas add to deal and organization pages, without those pages naming the areas.
- The Money section's tabbed home, with a placeholder tab for each feature to fill.
- The shared UI they all use: status tones, KPI cards, a wide dialog for a form beside its preview, and more than one table filter.
- The last 12 months and the chart axis and tooltip tokens.
- Sample data with a won deal in each of the last 12 months and eight deals in Proposal or Negotiation.
- Empty route homes for the three areas, so each feature fills its own file.

The PDFs and the dashboard's Money section stay with the features, to be brought together after the merges. The app's existing pages and actions keep working as they do; the new Money page says what is coming and the sample data is richer.

Test runs also take turns: three or four agents work on this computer at once, each in its own worktree, and each runs `npm run check` or `npm run check:quick` when it finishes a piece of work. More than two test runs at once overload the computer and tests time out, so no more than two go at once and the rest wait, saying they are waiting. The speed tests stay reliable by running with the computer to themselves.

## Constraints

- No new dependencies.
- The shared sums are used by the backend for what it saves, never totals from the browser.
- Number taking is atomic, because this app has no process-wide write lock.
- Deleting a held record is refused; an organization delete also checks the deals it would take, because SQLite does not enforce foreign keys here.
- Every unit test, old and new, runs in under a second.
