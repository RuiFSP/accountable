import type { CSSProperties } from "react";

import type { CompanySettings, InvoiceDesign } from "../api/client";
import { formatDate } from "../lib/dates";
import type { InvoiceStatus } from "../lib/invoice";
import { formatUsdWithCents } from "../lib/money";
import { formatTaxRate } from "../lib/settings";

/** One line as the document draws it: the snapshot, never a product's today. */
export interface SheetLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

/** The document's content: the invoice's page and the live form both shape this. */
export interface InvoiceSheet {
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: InvoiceStatus;
  bill_to_name: string | null;
  bill_to_address: string | null;
  bill_to_contact_name: string | null;
  bill_to_contact_email: string | null;
  lines: SheetLine[];
  subtotal_cents: number;
  tax_label: string | null;
  tax_rate_thousandths: number;
  tax_cents: number;
  total_cents: number;
}

export interface InvoicePreviewProps {
  invoice: InvoiceSheet;
  settings: CompanySettings;
  /** The logo as an image source; the letterhead shows the name alone without it. */
  logo?: string | null;
}

const MARKS: Partial<Record<InvoiceStatus, string>> = {
  paid: "PAID",
  overdue: "OVERDUE",
  void: "VOID",
};

const DESIGNS: InvoiceDesign[] = ["classic", "modern", "compact"];

function designOf(settings: CompanySettings): InvoiceDesign {
  return DESIGNS.includes(settings.invoice_design)
    ? settings.invoice_design
    : "classic";
}

/**
 * The invoice the customer gets: one of the three designs, on the business's
 * accent and logo, paper-white in both themes because it mirrors the PDF.
 */
export default function InvoicePreview({
  invoice,
  settings,
  logo,
}: InvoicePreviewProps) {
  const design = designOf(settings);
  const style = { "--sheet-accent": settings.accent_color } as CSSProperties;
  return (
    <div className="sheet-frame">
      <article
        className={`invoice-sheet sheet-${design}`}
        style={style}
        aria-label="Invoice document"
      >
        {MARKS[invoice.status] ? (
          <span className="sheet-mark">{MARKS[invoice.status]}</span>
        ) : null}
        <header className="sheet-head">
          {logo ? <img className="sheet-logo" src={logo} alt="" /> : null}
          <div className="sheet-brand">
            <h2 className="sheet-company">{settings.name}</h2>
            <div className="sheet-details">
              {(settings.address ?? "")
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
              <p>
                {[settings.email, settings.phone].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </header>
        <h3 className="sheet-title">INVOICE</h3>
        <div className="sheet-meta">
          <div className="sheet-billto">
            <p className="sheet-label">BILL TO</p>
            <p className="sheet-bill-name">{invoice.bill_to_name}</p>
            <div className="sheet-bill-lines">
              {(invoice.bill_to_address ?? "")
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
              {invoice.bill_to_contact_name ? (
                <p>{invoice.bill_to_contact_name}</p>
              ) : null}
              {invoice.bill_to_contact_email ? (
                <p>{invoice.bill_to_contact_email}</p>
              ) : null}
            </div>
          </div>
          <dl className="sheet-dates num">
            <dt>INVOICE NUMBER</dt>
            <dd>{invoice.number ?? "—"}</dd>
            <dt>ISSUE DATE</dt>
            <dd>{invoice.issue_date ? formatDate(invoice.issue_date) : "—"}</dd>
            <dt>DUE DATE</dt>
            <dd>{invoice.due_date ? formatDate(invoice.due_date) : "—"}</dd>
          </dl>
        </div>
        <table className="sheet-lines">
          <thead>
            <tr>
              <th scope="col">DESCRIPTION</th>
              <th scope="col">QTY</th>
              <th scope="col">UNIT PRICE</th>
              <th scope="col">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.description}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">
                  {formatUsdWithCents(line.unit_price_cents)}
                </td>
                <td className="num">
                  {formatUsdWithCents(line.quantity * line.unit_price_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="sheet-totals">
          <div>
            <dt>Subtotal</dt>
            <dd className="num">
              {formatUsdWithCents(invoice.subtotal_cents)}
            </dd>
          </div>
          <div>
            <dt>
              {`${invoice.tax_label ?? "Tax"} (${formatTaxRate(
                invoice.tax_rate_thousandths,
              )}%)`}
            </dt>
            <dd className="num">{formatUsdWithCents(invoice.tax_cents)}</dd>
          </div>
          <div className="sheet-total">
            <dt>Total</dt>
            <dd className="num">{formatUsdWithCents(invoice.total_cents)}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
