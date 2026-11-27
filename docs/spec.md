# Spec: Accountable

Accountable as it stands today: the problem it solves, what it does and how it is built. This is the description of the product and the authority for what it is. Each change updates it so it describes the product after the change merges, and keeps its own intent and plan in `docs/changes/<branch name>/`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what we sell and at what price, what we owe our suppliers and when it's due, what happened last with a customer or what needs doing next.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it is a complete sales CRM, a price list, a quoting tool and a record of the bills the business owes its suppliers, for a small team, on the web — a private Salesforce that does the everyday CRM essentials really well. It feels sharp, modern and professional, and is a pleasure to use.

- A small team shares one Accountable on the web: everyone signs in with an email and password and works on the same organizations, contacts, deals, products, quotes and bills.
- A quote turns the price list into an offer on a deal: pick products, set the quantities, watch the customer's document take shape beside the form, then send it as a PDF and record the answer. Accepting a quote wins the deal.
- The bills the business receives from suppliers are recorded in Money: the list shows what is unpaid, what is overdue and what has been paid, and the dashboard shows what is owed and what is due next.
- The team also keeps the business's own details in one place — name, address, contact details, tax, payment terms and document number prefixes — used on the quotes it sends today and ready for the invoices to come.
- Supabase holds the data and signs people in; no other business systems are involved.

## Out of scope

Not part of this version: roles and permissions — everyone can do everything; signing up in the app itself, or with Google, magic links or a password reset — people are added in Supabase's dashboard; a layout for phones; AI features; email, calendar or phone integrations; currencies other than US dollars; using products on deals; invoices themselves, so the Money section's Invoices tab still waits; emailing quotes or a page where the customer accepts one online; turning a quote into an invoice; purchase orders, receipts, approving or part-paying a bill, a scan of the bill, recurring bills and accounting entries; stock levels, product categories, units of measure or variants; per-customer price lists or discounts; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data; more than one tax rate; a company logo.

## Shared code

Each area keeps its own routes and pages. What every area needs lives above them, so no area imports another area's code: on the backend, `backend/app/records.py` holds the shared record helpers; on the frontend, shared UI sits in `frontend/src/components/` and shared logic in `frontend/src/lib/`, leaving `frontend/src/pages/` with only each area's own pages.

## Areas

One file per product area holds the detail behind this summary — the seven sections, the six kinds of record, the quote documents, company settings, sign-in, the shared behaviour and the design — with each design decision filed under the area it applies to:

- [Dashboard](specs/dashboard.md): the landing page, how sales are going at a glance.
- [Organizations](specs/organizations.md): the companies we do business with, and the Organization record.
- [Contacts](specs/contacts.md): the people we deal with, including leads and customers, and the Contact record.
- [Deals](specs/deals.md): the potential sales and the Deal record.
- [Products](specs/products.md): the price list of what the business sells, and the Product record.
- [Pipeline](specs/pipeline.md): the deals as cards on a board, one column per stage.
- [Activities](specs/activities.md): the Activity record, activities and follow-ups.
- [Tables](specs/tables.md): the search boxes — the top bar's and each table's — sort, add, edit and delete (archive and restore for products, no delete for quotes), and what deletion cascades to.
- [Money](specs/money.md): the home for quotes, invoices and bills, with a tab for each.
- [Quotes](specs/quotes.md): the offers sent to customers, tied to their deals, and their PDFs.
- [Bills](specs/bills.md): the bills the business receives from suppliers, and the Bill record.
- [Company settings](specs/company-settings.md): the business's own details for its documents, edited from the user menu.
- [Sign-in](specs/sign-in.md): signing in and out, the user behind each record, and the menu under your initials.
- [Running it](specs/running.md): the two ways to run it, sample data, resetting and deploying.
- [Look and feel](specs/look-and-feel.md): the brand, light and dark modes and contrast.
- [Design](specs/design.md): architecture, data model, API and frontend.
