# Spec: Dashboard

- **Dashboard**, the landing page: how sales are going at a glance. Deals won and revenue won month by month over the last 12 months, the open pipeline and its expected revenue (each deal's value times its probability of close), a sales funnel showing how much value reaches each stage, recent activity, and the follow-ups that are coming up or overdue. Below the sales charts, the Money section shows what the business owes its suppliers: what is still unpaid, how much is overdue, the bills due in the next 30 days, and spending by category over the last 12 months. It is visually striking, with at least a line chart, a bar chart and a visual of the pipeline.

## Design decisions

Points this spec fixes:

5. **Dashboard charts.** The dashboard shows a line chart (revenue won per month), a bar chart (deals won per month) and a funnel built from stage bars. The figures must match the data.
6. **The Money section starts with what we owe.** Below the sales charts sits one section called Money, holding the payables half: "Bills to pay" is the total of every unpaid bill, tax included, and how many bills that is; "Overdue" is the total and count of the unpaid bills whose due date is before today; "Due in the next 30 days" is the total and count of the unpaid bills due from today through 30 days from today. The three figures match the Bills tab: "Bills to pay" covers its Unpaid and Overdue views together, "Overdue" is its Overdue view, and the 30-day figure is the bills under the timeline's dates. A paid bill is in none of the three.
7. **The timeline and the spending chart.** The timeline lists the bills due in the next 30 days, soonest first, each with its supplier, its due date and its total, and says when nothing is due. The spending chart covers the same 12 months as the sales charts, one stacked bar per month with each category a segment in its category's color, counting each paid bill's total in the month it was paid. Unpaid bills are left out of the chart.
8. **Half a section for now.** This change builds only the payables half of the Money section. The invoices change adds what customers owe beside it; until then the section covers what the business owes alone, and the two halves are designed as one section after both changes land.
