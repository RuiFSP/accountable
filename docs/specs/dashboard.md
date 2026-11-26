# Spec: Dashboard

- **Dashboard**, the landing page: how sales are going at a glance. Deals won and revenue won month by month over the last 12 months, the open pipeline and its expected revenue (each deal's value times its probability of close), a sales funnel showing how much value reaches each stage, recent activity, and the follow-ups that are coming up or overdue. Below the sales charts, a Money section shows what customers owe, how much of it is overdue and how late, and the payments received each month over the last 12 months. It is visually striking, with at least a line chart, a bar chart and a visual of the pipeline.

## Design decisions

Points this spec fixes:

5. **Dashboard charts.** The dashboard shows a line chart (revenue won per month), a bar chart (deals won per month) and a funnel built from stage bars. The figures must match the data.
6. **The Money section.** Below the sales charts and above recent activity, it shows what customers owe — every issued invoice's balance, drafts and void invoices left out — how much of that is overdue and how late it is, in five buckets: not yet due, 1 to 30, 31 to 60, 61 to 90 and over 90 days past due, where an invoice due today is not yet due. Below those, the payments received in each of the last 12 months, bucketed by the day the payment arrived, in the same 12 buckets every other chart uses. The figures come from the invoices and payments themselves and must match them. The section shows customer invoices only for now; bills will add what the business owes. Two KPI cards lead it — what is owed and how much is overdue — with the aging as bars and the payments as a line chart, in the brand's chart colors and JetBrains Mono figures.
