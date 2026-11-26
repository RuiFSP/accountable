# Spec: Money

- **Money**: one section in the top bar for the documents that move money, with three tabs: Quotes, Invoices and Bills. Each tab has its own address, `/money/quotes`, `/money/invoices` and `/money/bills`, so refresh and back work. The Invoices tab holds the invoice area, as [Invoices](invoices.md) describes. Quotes and bills arrive in their own changes; until then each of their tabs says what is coming and lists nothing.
- The section holds only the lists and their document pages. The dashboard's Money section, which shows what customers owe and what the business owes, belongs to the dashboard and arrived with invoices; bills will add the other half.

## Design decisions

Points this spec fixes:

1. **One section, three tabs.** The top bar links to Money, not to three separate sections, so the bar keeps seven links. The tabs are links with their own addresses, in the top bar's pill style. The current tab is marked, and an unknown tab opens Quotes.
2. **Each area owns its tab.** The quotes, invoices and bills changes replace only their own tab's page, including any detail pages underneath it. `Money.tsx` holds the tab strip and the shared address; it never renders one area's records itself. The invoices change replaced the Invoices tab, list and detail pages included.
