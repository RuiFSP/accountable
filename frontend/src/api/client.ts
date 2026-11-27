/** Typed fetch wrapper for the Accountable JSON API. */

import { currentToken, endSession } from "../lib/session";

export type Stage =
  "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

export type ContactStatus = "lead" | "qualified" | "customer";

export type ActivityType = "note" | "call" | "email" | "stage_change";

/** What a person can log through the activity form. */
export type ActivityCreateType = "note" | "call" | "email";

/**
 * Who added a record and who last changed it: an email, or nothing for a
 * record written before this was recorded.
 */
export interface Attribution {
  created_by?: string | null;
  updated_by?: string | null;
}

export interface Organization extends Attribution {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  /** One free-text block, shown on the page and used on the invoices. */
  billing_address: string | null;
}

export interface Contact extends Attribution {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  organization_id: number | null;
  status: ContactStatus;
}

export interface Deal extends Attribution {
  id: number;
  name: string;
  organization_id: number;
  /** The main contact; null once the contact has been deleted. */
  contact_id: number | null;
  stage: Stage;
  value_cents: number;
  probability: number;
  close_date: string | null;
  position: number;
}

export interface Activity extends Attribution {
  id: number;
  type: ActivityType;
  contact_id: number | null;
  deal_id: number | null;
  description: string;
  happened_at: string;
  follow_up_date: string | null;
  done: boolean;
}

/** The team's company settings: one row for everyone. */
export interface CompanySettings {
  id: number;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  tax_label: string | null;
  /** The rate in thousandths of a percent: 8.875% is 8875. */
  tax_rate_thousandths: number;
  payment_terms_days: number;
  quote_prefix: string | null;
  invoice_prefix: string | null;
  invoice_design: InvoiceDesign;
  accent_color: string;
  /** What the uploaded logo is; its bytes are served at /api/settings/logo. */
  logo_content_type: string | null;
  updated_by: string | null;
  /** An ISO timestamp with an offset. */
  updated_at: string;
}

/** How an invoice is drawn: one of the three designs from Settings. */
export type InvoiceDesign = "classic" | "modern" | "compact";

export interface OrganizationInput {
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  billing_address: string | null;
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
  contact_id: number | null;
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

export interface CompanySettingsInput {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  tax_label: string | null;
  tax_rate_thousandths: number;
  payment_terms_days: number;
  quote_prefix: string | null;
  invoice_prefix: string | null;
  invoice_design: InvoiceDesign;
  accent_color: string;
}

/** An uploaded logo: its bytes travel base64, its type decided from them. */
export interface LogoInput {
  content_type: string;
  data: string;
}

/** A document's state as it is stored; the rest is worked out. */
export type InvoiceStoredStatus = "draft" | "issued" | "void";

/** The one status an invoice shows at a time. */
export type InvoiceStatus =
  "draft" | "issued" | "part paid" | "paid" | "overdue" | "void";

export type PaymentMethod =
  "bank_transfer" | "card" | "check" | "cash" | "other";

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  position: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  paid_on: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string | null;
  /** Who entered the payment. */
  created_by: string | null;
}

/** An invoice as the lists show it: every sum is the backend's own. */
export interface Invoice extends Attribution {
  id: number;
  number: string | null;
  deal_id: number;
  organization_id: number;
  deal_name: string;
  organization_name: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  subtotal_cents: number;
  tax_label: string | null;
  tax_rate_thousandths: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  /** None on a draft or a void invoice: those show no balance. */
  balance_cents: number | null;
  bill_to_name: string | null;
  bill_to_address: string | null;
  bill_to_contact_name: string | null;
  bill_to_contact_email: string | null;
}

/** One invoice as its page reads it, with its lines and its payments. */
export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  payments: Payment[];
}

export interface InvoiceLineInput {
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoiceCreateInput {
  deal_id: number;
  /** The form's lines, or none to start with one line of the whole value. */
  lines?: InvoiceLineInput[];
}

export interface PaymentInput {
  paid_on: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string | null;
}

/** What deleting a draft reports: the lines that go with it. */
export interface InvoiceDeleteResult {
  lines: string[];
  counts: Record<string, number>;
}

export interface Product extends Attribution {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  active: boolean;
}

export interface ProductInput {
  name: string;
  description: string | null;
  price_cents: number;
}

/** What a delete endpoint reports: the records removed alongside the target. */
export interface CascadeResult {
  contacts?: string[];
  deals?: string[];
  activities?: string[];
  /** How many of each kind went, straight from the server. */
  counts?: Record<string, number>;
}

/** What a search can match: the four kinds of record, as the API names them. */
export type SearchKind = "organization" | "contact" | "deal" | "product";

/** One match from the top-bar search: its kind, id and name. */
export interface SearchResult {
  kind: SearchKind;
  id: number;
  name: string;
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

/** How much of the debt is in each aging bucket, oldest money last. */
export interface AgingRow {
  bucket: string;
  cents: number;
}

/** What arrived in each of the last 12 months, as the charts plot it. */
export interface PaymentPoint {
  label: string;
  cents: number;
}

export interface MoneySummary {
  owed_cents: number;
  overdue_cents: number;
  aging: AgingRow[];
  payments: { month: string; cents: number }[];
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
  money: MoneySummary;
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

/** A refusal's detail, whether the backend sent one string or a field's list. */
function detailMessage(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (!Array.isArray(detail)) {
    return "";
  }
  return detail
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return "";
      }
      const { loc, msg } = item as { loc?: unknown; msg?: unknown };
      const where = Array.isArray(loc)
        ? loc.filter((part) => part !== "body").join(".")
        : "";
      return typeof msg === "string" ? (where ? `${where}: ${msg}` : msg) : "";
    })
    .filter(Boolean)
    .join("; ");
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = currentToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      // Only ever with a token: a signed-out request is today's request.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 401) {
    // The backend refused who we thought we were; the screen comes back.
    endSession();
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = detailMessage(body.detail);
    } catch {
      // The response had no JSON body; fall back to the status.
    }
    throw new Error(
      detail || `Request to ${path} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export function post<T>(path: string, payload?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

export function put<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(payload) });
}

export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

/** The bytes behind a path, such as an invoice's PDF, signed in like any call. */
export async function blobRequest(path: string): Promise<Blob> {
  const token = currentToken();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    endSession();
  }
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return response.blob();
}

/** The uploaded logo as an image source, or null when none is uploaded. */
export async function logoDataUrl(): Promise<string | null> {
  try {
    return await dataUrl(await blobRequest("/api/settings/logo"));
  } catch {
    return null;
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the logo."));
    reader.readAsDataURL(blob);
  });
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
  settings: {
    get: () => request<CompanySettings>("/api/settings"),
    save: (payload: CompanySettingsInput) =>
      put<CompanySettings>("/api/settings", payload),
    saveLogo: (payload: LogoInput) =>
      put<CompanySettings>("/api/settings/logo", payload),
    removeLogo: () => del<CompanySettings>("/api/settings/logo"),
  },
  search: {
    find: (q: string) =>
      request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  },
  activities: {
    list: () => request<Activity[]>("/api/activities"),
    create: (payload: ActivityInput) =>
      post<Activity>("/api/activities", payload),
    update: (id: number, payload: ActivityInput) =>
      put<Activity>(`/api/activities/${id}`, payload),
    remove: (id: number) => del<CascadeResult>(`/api/activities/${id}`),
  },
  products: {
    list: (includeArchived = false) =>
      request<Product[]>(
        includeArchived
          ? "/api/products?include_archived=true"
          : "/api/products",
      ),
    create: (payload: ProductInput) => post<Product>("/api/products", payload),
    update: (id: number, payload: ProductInput) =>
      put<Product>(`/api/products/${id}`, payload),
    archive: (id: number) => post<Product>(`/api/products/${id}/archive`),
    restore: (id: number) => post<Product>(`/api/products/${id}/restore`),
  },
};
