# Spec: Tables

Every table has a search box, columns you can sort by clicking their headings, a way to add a new record, and edit and delete on each row. That's how a new deal, a new lead or a new customer is added. Deleting asks first, and says what will happen to the records linked to the one being deleted. Deletion cascades: deleting an organization deletes its contacts and deals, and deleting a contact or deal deletes its activities — the confirmation lists everything that will go. Search is per table only: each box searches its own records, and there is no global search.

## Design decisions

Points this spec fixes:

6. **The cascade confirmation scrolls.** The delete dialog lists every record and activity that will go; with sample data an organization can take a dozen rows. The dialog scrolls, never truncates the list.
