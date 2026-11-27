import type { CompanyBlock, QuoteDocumentLine } from "../api/quotes";
import { formatDate } from "../lib/dates";
import { formatUsdWithCents } from "../lib/money";
import { formatTaxRate } from "../lib/settings";
import { lineAmount, totals } from "../lib/tax";

/** The document's rows as both sides draw them: the preview and the PDF. */
export interface QuoteDocumentModel {
  number: string | null;
  createdAt: string | null;
  validUntil: string | null;
  taxLabel: string | null;
  taxRateThousandths: number;
  lines: QuoteDocumentLine[];
  company: CompanyBlock;
  organizationName: string | null;
  contactName: string | null;
}

interface QuoteDocumentProps {
  document: QuoteDocumentModel;
}

/**
 * The quote as the customer sees it: the company, the customer, the number
 * and the dates, the lines and the totals. It is the customer's paper in both
 * app themes — white with Midnight ink and a Sea Green accent — and every
 * typed string is shown as text, never as markup.
 */
export default function QuoteDocument({ document }: QuoteDocumentProps) {
  const sums = totals(document.lines, document.taxRateThousandths);
  return (
    <article className="quote-document">
      <h3 className="quote-document-title">Quote</h3>
      <div className="quote-document-rule" aria-hidden="true" />
      <div className="quote-document-parties">
        <div className="quote-document-party">
          <p className="quote-document-label">From</p>
          <p className="quote-document-name">{document.company.name}</p>
          <p>{document.company.address}</p>
          <p>{document.company.email}</p>
          <p>{document.company.phone}</p>
        </div>
        <div className="quote-document-party">
          <p className="quote-document-label">To</p>
          <p className="quote-document-name">
            {document.organizationName ?? "—"}
          </p>
          <p>{document.contactName}</p>
        </div>
      </div>
      <dl className="quote-document-meta">
        <div>
          <dt>Quote number</dt>
          <dd className="num">{document.number ?? "—"}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(document.createdAt)}</dd>
        </div>
        <div>
          <dt>Valid until</dt>
          <dd>{formatDate(document.validUntil)}</dd>
        </div>
      </dl>
      <table className="quote-document-lines">
        <thead>
          <tr>
            <th>Product</th>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={index}>
              <td>{line.product_name}</td>
              <td>{line.description}</td>
              <td className="num">{line.quantity}</td>
              <td className="num">
                {formatUsdWithCents(line.unit_price_cents)}
              </td>
              <td className="num">{formatUsdWithCents(lineAmount(line))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="quote-document-totals">
        <div>
          <dt>Subtotal</dt>
          <dd className="num">{formatUsdWithCents(sums.subtotal_cents)}</dd>
        </div>
        <div>
          <dt>
            {document.taxLabel ?? "Tax"} (
            {formatTaxRate(document.taxRateThousandths)}%)
          </dt>
          <dd className="num">{formatUsdWithCents(sums.tax_cents)}</dd>
        </div>
        <div className="quote-document-total">
          <dt>Total</dt>
          <dd className="num">{formatUsdWithCents(sums.total_cents)}</dd>
        </div>
      </dl>
    </article>
  );
}
