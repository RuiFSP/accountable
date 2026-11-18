# Spec: Activities

- **Activity**: something that happened, or needs to happen, with a contact or deal. Type (note, call or email), the contact or deal it relates to, a description and when it happened, and optionally a follow-up date and whether it's done. Every activity also records who added it and who last changed it, shown as their email wherever the activity is read.

## Activities and follow-ups

From any contact or deal you can log an activity (a note, call or email) and give it a follow-up date. An activity relates to exactly one record — a contact or a deal, never both. A follow-up shows on the dashboard as a task until it's marked done. Activities can be edited and deleted too. When a deal moves to another stage, including Won or Lost, an entry such as "Moved from Proposal to Negotiation" appears in its timeline and in the dashboard's recent activity by itself.

## Design decisions

Points this spec fixes:

4. **Stage changes are system entries, not activities.** Activities have only three types (note, call, email), but a stage change must still appear in timelines and recent activity. It is recorded as a system-generated entry in the same list, read-only.
