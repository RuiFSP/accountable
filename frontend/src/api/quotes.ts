/**
 * Quotes: the document on a deal and its five states. The sums come from the
 * server; a page only ever sends quantities and unit prices.
 */

import type { Attribution } from "./client";
import { post, put, request } from "./client";
import { currentToken, endSession } from "../lib/session";

/** The state a quote shows in: expired is a sent quote past its date. */
export type QuoteStatus =
  "draft" | "sent" | "expired" | "accepted" | "declined";

/** One line as the document shows it; a stored line adds its ids below. */
export interface QuoteDocumentLine {
  product_name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
}

export interface QuoteLine extends QuoteDocumentLine {
  id: number;
  quote_id: number;
  product_id: number;
  position: number;
  amount_cents: number;
}

/** The company's details on the document, as Settings holds them. */
export interface CompanyBlock {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface Quote extends Attribution {
  id: number;
  number: string;
  deal_id: number;
  deal_name: string;
  organization_id: number | null;
  organization_name: string | null;
  status: QuoteStatus;
  created_at: string;
  valid_until: string;
  tax_label: string | null;
  tax_rate_thousandths: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

export interface QuoteDetail extends Quote {
  lines: QuoteLine[];
  company: CompanyBlock;
  contact_name: string | null;
}

export interface QuoteLineInput {
  product_id: number;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
}

/** What a quote is created from: the deal, the date and the lines only. */
export interface QuoteInput {
  deal_id: number;
  valid_until: string | null;
  lines: QuoteLineInput[];
}

export interface QuoteUpdateInput {
  valid_until: string | null;
  lines: QuoteLineInput[];
}

/** The five totals including tax, one per state a quote shows in. */
export type QuoteTotals = Record<QuoteStatus, number>;

export interface QuoteListReply {
  quotes: Quote[];
  /** The whole list's totals; a filtered list carries none. */
  totals?: QuoteTotals;
}

export interface QuoteFilter {
  deal_id?: number;
  organization_id?: number;
}

export function list(filter?: QuoteFilter): Promise<QuoteListReply> {
  const query = new URLSearchParams();
  if (filter?.deal_id !== undefined) {
    query.set("deal_id", String(filter.deal_id));
  }
  if (filter?.organization_id !== undefined) {
    query.set("organization_id", String(filter.organization_id));
  }
  const search = query.toString();
  return request<QuoteListReply>(
    search ? `/api/quotes?${search}` : "/api/quotes",
  );
}

export function get(id: number): Promise<QuoteDetail> {
  return request<QuoteDetail>(`/api/quotes/${id}`);
}

export function create(payload: QuoteInput): Promise<QuoteDetail> {
  return post<QuoteDetail>("/api/quotes", payload);
}

export function update(
  id: number,
  payload: QuoteUpdateInput,
): Promise<QuoteDetail> {
  return put<QuoteDetail>(`/api/quotes/${id}`, payload);
}

export function send(id: number): Promise<QuoteDetail> {
  return post<QuoteDetail>(`/api/quotes/${id}/send`);
}

export function copy(id: number): Promise<QuoteDetail> {
  return post<QuoteDetail>(`/api/quotes/${id}/copy`);
}

export function accept(id: number): Promise<QuoteDetail> {
  return post<QuoteDetail>(`/api/quotes/${id}/accept`);
}

export function decline(id: number): Promise<QuoteDetail> {
  return post<QuoteDetail>(`/api/quotes/${id}/decline`);
}

/**
 * The customer's PDF, made on the server when the download is asked for.
 * It is a file, not JSON, so it carries its own request.
 */
export async function pdf(id: number): Promise<Blob> {
  const path = `/api/quotes/${id}/pdf`;
  const token = currentToken();
  const response = await fetch(path, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (response.status === 401) {
    endSession();
  }
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
  return response.blob();
}
