# Spec: Accountable

Accountable as it stands today: the problem it solves, what it does and how it is built. This is the description of the product and the authority for what it is. Each change updates it so it describes the product after the change merges, and keeps its own intent and plan in `docs/changes/<branch name>/`.

## Problem

A small business keeps track of its customers and sales in spreadsheets, inboxes and people's heads. Nobody can see at a glance which companies we deal with, who our contacts are, what's in the sales pipeline, what we sell and at what price, what happened last with a customer, what needs doing next, what customers owe or who has paid.

## What Accountable is

Accountable is a business management system: a sales CRM that will grow into a full Business OS, including ERP. Today it is a sales CRM, a price list and invoicing for a small team, on the web — a private Salesforce that does the everyday CRM essentials really well. It feels sharp, modern and professional, and is a pleasure to use.

- A small team shares one Accountable on the web: everyone signs in with an email and password and works on the same organizations, contacts, deals, products and invoices.
- For a won deal you make the invoice, issue it and record the payments as they arrive, and download the PDF the customer gets — and the dashboard's Money section shows what customers owe and how late they are.
- The team also keeps the business's own details in one place — name, address, contact details, tax, payment terms, document number prefixes and the look of its documents — used on the invoices that go out and ready for the quotes and bills that come later.
- Supabase holds the data and signs people in; no other business systems are involved.

## Out of scope

Not part of this version: roles and permissions — everyone can do everything; signing up in the app itself, or with Google, magic links or a password reset — people are added in Supabase's dashboard; a layout for phones; AI features; email, calendar or phone integrations; currencies other than US dollars; using products on deals; quotes and bills themselves, so the Money section's other two tabs still hold only the places they will fill; credit notes or refunds; emailing invoices, payment reminders, online payment or recurring invoices; creating an invoice from a quote; accounting entries; stock levels, product categories, units of measure or variants; per-customer price lists or discounts; reports beyond the dashboard; tags or custom fields; changing the pipeline stages; importing or exporting data; more than one tax rate.

## Shared code

Each area keeps its own routes and pages. What every area needs lives above them, so no area imports another area's code: on the backend, `backend/app/records.py` holds the shared record helpers; on the frontend, shared UI sits in `frontend/src/components/` and shared logic in `frontend/src/lib/`, leaving `frontend/src/pages/` with only each area's own pages.

## Areas

One file per product area holds the detail behind this summary — the seven sections, the kinds of record, company settings, sign-in, the shared behaviour and the design — with each design decision filed under the area it applies to:

- [Dashboard](specs/dashboard.md): the landing page, how sales are going at a glance and what customers owe.
- [Organizations](specs/organizations.md): the companies we do business with, and the Organization record.
- [Contacts](specs/contacts.md): the people we deal with, including leads and customers, and the Contact record.
- [Deals](specs/deals.md): the potential sales and the Deal record.
- [Products](specs/products.md): the price list of what the business sells, and the Product record.
- [Pipeline](specs/pipeline.md): the deals as cards on a board, one column per stage.
- [Activities](specs/activities.md): the Activity record, activities and follow-ups.
- [Invoices](specs/invoices.md): the invoices for won deals, their payments and their PDFs, and the Invoice record.
- [Tables](specs/tables.md): the search boxes — the top bar's and each table's — sort, add, edit and delete (archive and restore for products, drafts only for invoices), and what deletion cascades to.
- [Money](specs/money.md): the home for quotes, invoices and bills, with a tab for each.
- [Company settings](specs/company-settings.md): the business's own details for its documents, edited from the user menu.
- [Sign-in](specs/sign-in.md): signing in and out, the user behind each record, and the menu under your initials.
- [Running it](specs/running.md): the two ways to run it, sample data, resetting and deploying.
- [Look and feel](specs/look-and-feel.md): the brand, light and dark modes and contrast.
- [Design](specs/design.md): architecture, data model, API and frontend.
