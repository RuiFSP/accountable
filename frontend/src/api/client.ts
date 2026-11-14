/** Typed fetch wrapper for the Accountable JSON API. */

export type Stage =
  "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

export type ContactStatus = "lead" | "qualified" | "customer";

export type ActivityType = "note" | "call" | "email" | "stage_change";

/** What a person can log through the activity form. */
export type ActivityCreateType = "note" | "call" | "email";

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
  organization_id: number;
  contact_id: number;
  stage: Stage;
  value_cents: number;
  probability: number;
  close_date: string | null;
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

export interface OrganizationInput {
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
}

export interface ContactInput {
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  organization_id: number | null;
  status: ContactStatus;
}

export interface DealInput {
  name: string;
  organization_id: number;
  contact_id: number;
  stage: Stage;
  value_cents: number;
  probability: number;
  close_date: string;
  position: number | null;
}

export interface ActivityInput {
  type: ActivityCreateType;
  contact_id: number | null;
  deal_id: number | null;
  description: string;
  happened_at: string;
  follow_up_date: string | null;
  done: boolean;
}

/** What a delete endpoint reports: the records removed alongside the target. */
export interface CascadeResult {
  contacts?: string[];
  deals?: string[];
  activities?: string[];
}

export interface WonMonth {
  month: string;
  revenue_cents: number;
  deals: number;
}

export interface FunnelStageRow {
  stage: Stage;
  count: number;
  value_cents: number;
  expected_cents: number;
}

export interface ColumnTotals {
  count: number;
  value_cents: number;
  expected_cents: number;
}

export interface DashboardPayload {
  won: { months: WonMonth[]; total_revenue_cents: number; total_deals: number };
  pipeline: { value_cents: number; expected_cents: number; count: number };
  funnel: {
    stages: FunnelStageRow[];
    won_12m_cents: number;
    won_12m_count: number;
    lost_cents: number;
    lost_count: number;
  };
  recent_activity: Activity[];
  follow_ups: {
    overdue: Activity[];
    upcoming: Activity[];
    overdue_count: number;
    open_count: number;
  };
}

export interface StageMoveInput {
  stage: Stage;
  position: number;
}

export interface StageMoveResult {
  deal: Deal;
  totals: {
    board: { value_cents: number; expected_cents: number; count: number };
    columns: Record<Stage, ColumnTotals>;
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // The response had no JSON body; fall back to the status.
    }
    throw new Error(
      detail || `Request to ${path} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(payload) });
}

function put<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(payload) });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export const api = {
  organizations: {
    list: () => request<Organization[]>("/api/organizations"),
    create: (payload: OrganizationInput) =>
      post<Organization>("/api/organizations", payload),
    update: (id: number, payload: OrganizationInput) =>
      put<Organization>(`/api/organizations/${id}`, payload),
    remove: (id: number) => del<CascadeResult>(`/api/organizations/${id}`),
  },
  contacts: {
    list: () => request<Contact[]>("/api/contacts"),
    create: (payload: ContactInput) => post<Contact>("/api/contacts", payload),
    update: (id: number, payload: ContactInput) =>
      put<Contact>(`/api/contacts/${id}`, payload),
    remove: (id: number) => del<CascadeResult>(`/api/contacts/${id}`),
  },
  deals: {
    list: () => request<Deal[]>("/api/deals"),
    create: (payload: DealInput) => post<Deal>("/api/deals", payload),
    update: (id: number, payload: DealInput) =>
      put<Deal>(`/api/deals/${id}`, payload),
    move: (id: number, payload: StageMoveInput) =>
      post<StageMoveResult>(`/api/deals/${id}/stage`, payload),
    remove: (id: number) => del<CascadeResult>(`/api/deals/${id}`),
  },
  dashboard: {
    get: () => request<DashboardPayload>("/api/dashboard"),
  },
  activities: {
    list: () => request<Activity[]>("/api/activities"),
    create: (payload: ActivityInput) =>
      post<Activity>("/api/activities", payload),
    update: (id: number, payload: ActivityInput) =>
      put<Activity>(`/api/activities/${id}`, payload),
    remove: (id: number) => del<CascadeResult>(`/api/activities/${id}`),
  },
};
