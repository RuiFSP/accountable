# Spec: Money

- **Money**: one section in the top bar for the documents that move money, with three tabs: Quotes, Invoices and Bills. Each tab has its own address, `/money/quotes`, `/money/invoices` and `/money/bills`, so refresh and back work. Quotes are live: the Quotes tab lists every quote with the five status totals and opens each quote's own page, as [Quotes](quotes.md) describes. Invoices and bills arrive in their own changes; until then those tabs say what is coming and list nothing.
- The section holds only the lists and their document pages. The dashboard's Money section, which shows what customers owe and what the business owes, belongs to the dashboard and arrives with invoices and bills.

## Design decisions

Points this spec fixes:

1. **One section, three tabs.** The top bar links to Money, not to three separate sections, so the bar keeps seven links. The tabs are links with their own addresses, in the top bar's pill style. The current tab is marked, and an unknown tab opens Quotes.
2. **Each area owns its tab.** Each change replaces only its own tab's page, including any detail pages underneath it: the quotes change replaced the Quotes tab and the quote pages below it, and the invoices and bills changes replace only theirs. `Money.tsx` holds the tab strip and the shared address; it never renders one area's records itself.
