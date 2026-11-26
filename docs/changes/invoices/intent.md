# Intent: invoices and payments

## Problem

Once a deal is won, billing happens outside Accountable. Nobody can see what customers owe, which invoices are overdue or who has paid.

## Proposed outcome

For a won deal, you can create its invoice: pick products, set quantities, and adjust each line's description or price. The invoice adds up its lines and applies the tax from Settings; its Bill to block shows the organization's name and billing address and the deal's contact. While you edit, a live preview beside the form shows the invoice exactly as the customer will see it. When it's ready, you issue it: it gets its number, its due date comes from the payment terms in Settings, and you can download it as a PDF that looks like the preview. You record payments against an issued invoice as they arrive, in full or in part, and the invoice shows a bar of how much is paid and what's still owed. Paid, overdue and void invoices carry a clear mark on the preview and the PDF.

The invoices look the way the business wants. In Settings, a new Documents section lets you choose one of three invoice designs, pick an accent color and upload the company's logo, with a preview of a sample invoice that updates as you choose.

The Invoices tab under Money lists every invoice with its status and balance, each deal and organization shows its invoices, and a new Money section on the dashboard, below the sales charts, shows what customers owe, how much of it is overdue and how late (not yet due, 1 to 30, 31 to 60, 61 to 90 and over 90 days), and the payments received each month over the last 12 months.

## Constraints

- Amounts are stored as whole cents. A line's amount is its quantity times its unit price. Tax is worked out once, on the subtotal, and rounded to the nearest cent, with halves rounding up.
- An invoice gets its number when it's issued, never as a draft: the invoice prefix from Settings followed by a sequence, such as INV-0001, with no gaps or repeats, even when two people issue invoices at the same moment.
- A won deal has at most one invoice that isn't void, and its subtotal before tax equals the deal's value. A voided invoice is kept for the record and doesn't stop a replacement. An organization keeps an optional billing address, one free-text block, shown on its page and used on its invoices.
- The issue date is chosen when the invoice is issued, defaulting to today. The due date is the issue date plus the payment terms in Settings. A payment's date defaults to today and can be set to when it arrived.
- An invoice is draft, issued, paid or void. An issued invoice shows as part paid when some of it is paid, and as overdue when money is still owed after its due date.
- Only a draft can be changed or deleted. An issued invoice never changes. A mistake is fixed by voiding the invoice, which keeps its number and marks the PDF VOID. An invoice with payments can't be voided.
- A line keeps the product's name and price as they were when it was added. The invoice keeps the tax label and rate as they were when it was issued.
- A payment has a date, an amount, a method (bank transfer, card, check, cash or other) and an optional reference. It must be more than zero and no more than what's still owed. A payment entered by mistake can be deleted, and the balance goes back up.
- The backend works out every amount and balance. It never trusts totals sent from the browser.
- The PDF is made when you download it. Anything typed into the invoice appears on the PDF as plain text, never as markup.
- Any PDF library must install with uv and run on Render's native Python runtime with no system packages.
- The three designs are distinct, professional and readable in print. The accent color is checked for contrast against white, and the page refuses one that would make text hard to read.
- The logo is a PNG or JPEG of up to 1 MB, kept in the database, since Render's disk doesn't keep files. The backend checks that the file really is an image of that type, whatever its name says, and refuses anything else, including SVG.
- The sample data includes one invoice for each won deal of the last 12 months, each with a subtotal matching its deal's value: most paid, some part paid, some overdue by different amounts, and a few drafts, so every panel and chart looks full from the first visit. The organizations with invoices have billing addresses, and the sample company has a logo and a design chosen.
- Every unit test, old and new, runs in under a second on this computer, because CI runs on a much slower machine.
- No new dependencies unless the plan makes the case for one.

## Not in this change

- Credit notes or refunds.
- Emailing invoices, payment reminders, online payment or recurring invoices.
- Creating an invoice from a quote.
- Accounting entries.

## Success criteria

1. npm run check passes.
2. An invoice with three lines adds up exactly, tax included, in the app and on the PDF.
3. An issued invoice can't be changed, through the page or the API, and its number never changes.
4. Payments bring the balance down to zero and the invoice becomes paid. A payment for more than the balance is refused.
5. An issued invoice past its due date shows as overdue on its page, in the list and on the dashboard.
6. Invoice numbers have no gaps or repeats, even when two invoices are issued at the same moment.
7. Each of the three designs, with any accepted accent color and a logo, gives a PDF that looks like its preview.
8. A file that isn't a PNG or JPEG is refused as a logo, even when it's renamed to end in .png.
9. On a fresh copy with the sample data, the Invoices tab, the deal pages and the dashboard's Money section are full of realistic figures.
10. A won deal has at most one invoice that isn't void, its subtotal matches the deal's value, and the invoice's Bill to block carries the organization's billing address.
