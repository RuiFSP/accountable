# Spec: Deals

- **Deals**: the potential sales, with each one's stage, value and close date. Open one to see its details, its timeline and its invoices. A deal still open after its expected close date stands out, in the table and on its pipeline card.
- **Deal**: a potential sale. Name, the organization and the main contact it is with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars, its probability of close, and its expected or actual close date. Each stage has a usual probability of close, and a deal takes its new stage's probability when it moves; a probability set by hand is kept until the stage changes. The detail page shows who added it and who last changed it, as their email. A won deal can be invoiced, and while it has an invoice that isn't void its value is fixed, because the invoice's lines must add up to it.

## Design decisions

Points this spec fixes:

2. **Stage probabilities.** Each stage has a usual probability of close: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. They live here; change them here if they feel wrong.
3. **A held deal can't be deleted.** While a quote or invoice points at a deal, its delete is refused with a 409 naming what holds it, such as "This deal has 1 invoice, so it can't be deleted." The dialog shows that message and offers only Close. A voided invoice holds the deal too, since it is kept for the record. A deal with nothing holding it keeps today's cascade.
4. **Later areas add panels to the deal page.** The quotes and invoices changes each add a panel below the deal's details, such as its quotes. The page renders the panels it is given, in order, and never names the area that made one. The invoice panel is shown; the quotes panel comes with its change.
5. **An invoiced deal keeps its value.** While a won deal has an invoice that isn't void, the deal's value is locked: the edit dialog shows it read-only and the API refuses a change with a 409. Its other fields stay editable, and deleting the draft or voiding the invoice frees the value again.
