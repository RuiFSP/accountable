# Intent: bills

## Problem

Accountable tracks the money customers owe us but not the money we owe. Nobody can see which supplier bills are unpaid or when they're due.

## Proposed outcome

The Bills tab in Money, at `/money/bills`, records the bills the business receives: the supplier, the supplier's own bill number, the bill date, the due date, the amount before tax, the tax, a category and notes. You mark a bill paid when you pay it. The list shows what's unpaid, what's overdue and what's been paid, with each category in its own color, and each organization shows its bills.

A new Money section on the dashboard, below the sales charts, shows what we owe and how much of it is overdue, a timeline of the bills due in the next 30 days, and spending by category for each of the last 12 months. The spending chart counts paid bills in the month they were paid. This change builds only the payables half of the section; the customers-owe half arrives with invoices, and the spec is updated to say so.

## Constraints

- A bill's supplier is an organization, so an organization can be a customer, a supplier or both.
- Amounts are stored as whole cents. The tax is entered as it appears on the bill, since a supplier's tax can differ from ours. The total is the amount plus the tax, worked out by the backend.
- The due date starts as 30 days after the bill date, and can be changed.
- Categories are a fixed list: Software, Contractors, Travel, Office, Marketing and Other.
- A bill is unpaid or paid, with the date it was paid. An unpaid bill shows as overdue when its due date has passed. Marking a bill paid can be undone.
- The same supplier can't have two bills with the same bill number.
- Each bill records who added it and who last changed it, like every other record.
- The sample data includes bills over the last 12 months from a handful of supplier organizations added for the purpose, such as a software vendor, a contractor and an office landlord, with regular monthly bills and occasional large ones: most paid, some unpaid and a few overdue, so every panel and chart looks full from the first visit.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Purchase orders, receipts, or approving bills before they're paid.
- Quotes and invoices; their Money tabs keep the coming-soon pages.
- Paying part of a bill.
- Attaching a scan of the bill.
- Recurring bills.
- Accounting entries.

## Success criteria

1. npm run check passes.
2. A bill can be added, edited, marked paid and marked unpaid again.
3. The dashboard's figures for what we owe, what's overdue and what's due in the next 30 days match the unpaid bills, and the spending chart matches the paid bills by paid month and category.
4. A bill number used twice for the same supplier is refused, through the page or the API.
5. An unpaid bill past its due date shows as overdue in the list and on the dashboard.
6. On a fresh copy with the sample data, the Bills tab and the dashboard's Money section are full of realistic figures.
