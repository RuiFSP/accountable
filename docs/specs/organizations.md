# Spec: Organizations

- **Organizations**: the companies we do business with, whether they buy from us, supply us or both. Open one to see its contacts, deals, quotes, invoices and bills — just the lists, no merged timeline; history lives on each contact and deal.
- **Organization**: a company we do business with. Name, website, industry, notes and an optional billing address — one free-text block, used on the organization's invoices and shown on its page. An organization has many contacts, many deals, and can supply many bills. Its detail page shows who added it and who last changed it, as their email.

## Design decisions

1. **Held organizations can't be deleted.** While a quote, invoice or bill in another area points at an organization, or at one of the deals the delete would take, the delete is refused with a 409 naming what holds it, such as "This organization has 2 invoices, so it can't be deleted." The dialog shows that message and offers only Close. An invoice holds its organization even after it is voided. Deleting an organization with nothing holding it keeps today's cascade.
2. **Areas add panels to the page.** The quotes change puts the organization's quotes below its contacts and deals, the invoices change adds its invoice panel, and the bills change adds the organization's bills — their number, due date, total and status — the same way. The page renders the panels it is given, in order, and never names the area that made one. The bills panel lists only; marking a bill paid, editing it and deleting it happen in the Bills tab.
3. **The billing address is one block, and the invoice keeps it.** The billing address is optional free text in the organization's form, shown on its page and copied into an invoice's Bill to block when the invoice is issued. Changing it afterwards never moves an invoice already issued.
