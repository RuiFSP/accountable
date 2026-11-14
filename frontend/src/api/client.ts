/** Typed fetch wrapper for the Accountable JSON API. */

export type Stage =
  "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

export type ContactStatus = "lead" | "qualified" | "customer";

export type ActivityType = "note" | "call" | "email" | "stage_change";

export interface Organization {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
}

export interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  organization_id: number | null;
  status: ContactStatus;
}

export interface Deal {
  id: number;
  name: string;
  organization_id: number | null;
  contact_id: number | null;
  stage: Stage;
  value_cents: number;
  probability: number;
  close_date: string;
  position: number;
}

export interface Activity {
  id: number;
  type: ActivityType;
  contact_id: number | null;
  deal_id: number | null;
  description: string;
  happened_at: string;
  follow_up_date: string | null;
  done: boolean;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  organizations: () => request<Organization[]>("/api/organizations"),
  contacts: () => request<Contact[]>("/api/contacts"),
  deals: () => request<Deal[]>("/api/deals"),
  activities: () => request<Activity[]>("/api/activities"),
};
