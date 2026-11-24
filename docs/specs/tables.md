# Spec: Tables

Every table has a search box, columns you can sort by clicking their headings, a way to add a new record, and edit and delete on each row. That's how a new deal, a new lead, a new customer or a new product is added. Deleting asks first, and says what will happen to the records linked to the one being deleted. Deletion cascades: deleting an organization deletes its contacts and deals, and deleting a contact or deal deletes its activities — the confirmation lists everything that will go. The Products table is the exception: products are archived and restored, never deleted, as [Products](products.md) describes, and a Show archived control brings the hidden ones back into view. Search works at two levels: each table's own box searches that table's records, and a box in the top bar finds any organization, contact, deal or active product by part of its name, ignoring case — the same on SQLite and Postgres.

## Design decisions

Points this spec fixes:

6. **The cascade confirmation scrolls.** The delete dialog lists every record and activity that will go; with sample data an organization can take a dozen rows. The dialog scrolls, never truncates the list.
10. **Two searches.** The top bar's search matches part of an organization, contact, deal or active product name, ignoring case, the same on SQLite and Postgres. Each table's own search box keeps working the way it does today; a product match opens the Products page with that product shown, and archived products are left out of the top bar.
