# Spec: Deals

- **Deals**: the potential sales, with each one's stage, value and close date. Open one to see its details and its timeline. A deal still open after its expected close date stands out, in the table and on its pipeline card.
- **Deal**: a potential sale. Name, the organization and the main contact it is with, its stage (New, Qualified, Proposal, Negotiation, Won or Lost), its value in US dollars, its probability of close, and its expected or actual close date. Each stage has a usual probability of close, and a deal takes its new stage's probability when it moves; a probability set by hand is kept until the stage changes. The detail page shows who added it and who last changed it, as their email.

## Design decisions

Points this spec fixes:

2. **Stage probabilities.** Each stage has a usual probability of close: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%. They live here; change them here if they feel wrong.
3. **A held deal can't be deleted.** While a quote or invoice points at a deal, its delete is refused with a 409 naming what holds it, such as "This deal has 2 quotes and 1 invoice, so it can't be deleted." The dialog shows that message and offers only Close. A deal with nothing holding it keeps today's cascade.
4. **Later areas add panels to the deal page.** The quotes and invoices changes each add a panel below the deal's details, such as its quotes. The page renders the panels it is given, in order, and never names the area that made one. None are shown yet.
