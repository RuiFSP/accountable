# Spec: Money

- **Money**: one section in the top bar for the documents that move money, with three tabs: Quotes, Invoices and Bills. Each tab has its own address, `/money/quotes`, `/money/invoices` and `/money/bills`, so refresh and back work. Quotes are live: the Quotes tab lists every quote with the five status totals and opens each quote's own page, as [Quotes](quotes.md) describes. Invoices are live: the Invoices tab holds the invoice area, as [Invoices](invoices.md) describes. Bills records the bills the business receives from suppliers, as [Bills](bills.md) describes.
- The section holds only the lists and their document pages. The dashboard's Money section, which shows what customers owe and what the business owes, belongs to the dashboard; both halves are live.

## Design decisions

Points this spec fixes:

1. **One section, three tabs.** The top bar links to Money, not to three separate sections, so the bar keeps seven links. The tabs are links with their own addresses, in the top bar's pill style. The current tab is marked, and an unknown tab opens Quotes.
2. **Each area owns its tab.** Each change replaces only its own tab's page, including any detail pages underneath it: the quotes change replaced the Quotes tab and the quote pages below it, the invoices change replaced the Invoices tab, list and detail pages included, and the bills change replaced the Bills tab. `Money.tsx` holds the tab strip and the shared address; it never renders one area's records itself.
3. **All three tabs are live.** The Bills tab at `/money/bills` is the bills area's page: its table, the add and edit dialog and the row actions. The Quotes and Invoices tabs are their areas' pages too.
