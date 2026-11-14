/**
 * What a delete will take with it, computed from the records already loaded,
 * so the confirmation can list everything before anything is removed.
 * The server computes the same lists again when the delete runs.
 */

import type { Activity, Contact, Deal } from "../api/client";

export interface CascadeGroup {
  label: string;
  items: string[];
}

export interface RecordLists {
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
}

export type CascadeTarget = "organization" | "contact" | "deal";

export function cascadePreview(
  target: CascadeTarget,
  recordId: number,
  lists: RecordLists,
): CascadeGroup[] {
  if (target === "contact") {
    return group(
      "Activities",
      lists.activities.filter((activity) => activity.contact_id === recordId),
      (activity) => activity.description,
    );
  }
  if (target === "deal") {
    return group(
      "Activities",
      lists.activities.filter((activity) => activity.deal_id === recordId),
      (activity) => activity.description,
    );
  }

  const contacts = lists.contacts.filter(
    (contact) => contact.organization_id === recordId,
  );
  const deals = lists.deals.filter((deal) => deal.organization_id === recordId);
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const dealIds = new Set(deals.map((deal) => deal.id));
  const activities = lists.activities.filter(
    (activity) =>
      (activity.contact_id !== null && contactIds.has(activity.contact_id)) ||
      (activity.deal_id !== null && dealIds.has(activity.deal_id)),
  );

  return [
    ...group("Contacts", contacts, (contact) => contact.name),
    ...group("Deals", deals, (deal) => deal.name),
    ...group("Activities", activities, (activity) => activity.description),
  ];
}

function group<T>(
  label: string,
  rows: T[],
  labelOf: (row: T) => string,
): CascadeGroup[] {
  if (rows.length === 0) {
    return [];
  }
  return [{ label, items: rows.map(labelOf) }];
}
