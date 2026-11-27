import {
  blobRequest,
  del,
  post,
  put,
  request,
  type Invoice,
  type InvoiceCreateInput,
  type InvoiceDeleteResult,
  type InvoiceDetail,
  type InvoiceLineInput,
  type PaymentInput,
} from "./client";

export interface InvoiceListParams {
  q?: string;
  status?: string;
  deal_id?: number;
  organization_id?: number;
}

function query(params: InvoiceListParams): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** The invoices area's requests, in the seam client.ts leaves for each area. */
export const invoicesApi = {
  list: (params: InvoiceListParams = {}) =>
    request<Invoice[]>(`/api/invoices${query(params)}`),
  get: (id: number) => request<InvoiceDetail>(`/api/invoices/${id}`),
  create: (payload: InvoiceCreateInput) =>
    post<InvoiceDetail>("/api/invoices", payload),
  update: (id: number, lines: InvoiceLineInput[]) =>
    put<InvoiceDetail>(`/api/invoices/${id}`, { lines }),
  remove: (id: number) => del<InvoiceDeleteResult>(`/api/invoices/${id}`),
  issue: (id: number, issueDate: string) =>
    post<InvoiceDetail>(`/api/invoices/${id}/issue`, { issue_date: issueDate }),
  void: (id: number) => post<InvoiceDetail>(`/api/invoices/${id}/void`),
  recordPayment: (id: number, payload: PaymentInput) =>
    post<InvoiceDetail>(`/api/invoices/${id}/payments`, payload),
  deletePayment: (id: number, paymentId: number) =>
    del<InvoiceDetail>(`/api/invoices/${id}/payments/${paymentId}`),
};

/** Save the invoice's PDF under its number, the way the page offers it. */
export async function downloadPdf(invoice: Invoice): Promise<void> {
  const pdf = await blobRequest(`/api/invoices/${invoice.id}/pdf`);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoice.number ?? "invoice"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
