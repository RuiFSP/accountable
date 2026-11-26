# Spec: Organizations

- **Organizations**: the companies we do business with. Open one to see its contacts, deals and quotes — just the lists, no merged timeline; history lives on each contact and deal.
- **Organization**: a company we do business with. Name, website, industry and notes. An organization has many contacts and many deals. Its detail page shows who added it and who last changed it, as their email.

## Design decisions

1. **Held organizations can't be deleted.** While a quote points at an organization, or at one of the deals the delete would take, the delete is refused with a 409 naming what holds it, such as "This organization has 2 quotes, so it can't be deleted." The dialog shows that message and offers only Close. Deleting an organization with nothing holding it keeps today's cascade. The invoices and bills changes add their own holds when they come.
2. **Areas add panels to the page.** The quotes change puts the organization's quotes below its contacts and deals, and the invoices and bills changes add their own when they come. The page renders the panels it is given, in order, and never names the area that made one.
