import { useState } from "react";

import type {
  CompanySettings,
  InvoiceDetail,
  InvoiceLineInput,
  Product,
} from "../api/client";
import { formatDate, todayIso } from "../lib/dates";
import { formatUsdWithCents, parseUsdToCents } from "../lib/money";
import {
  AMOUNT_MESSAGE,
  MAX_AMOUNT_CENTS,
  QUANTITY_MESSAGE,
  parseQuantity,
  totals,
} from "../lib/tax";
import Field from "./Field";
import InvoicePreview, { type InvoiceSheet } from "./InvoicePreview";
import Modal from "./Modal";

export interface InvoiceFormDeal {
  id: number;
  name: string;
  value_cents: number;
}

export interface InvoiceFormBillTo {
  name: string | null;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface InvoiceFormProps {
  deal: InvoiceFormDeal;
  billTo: InvoiceFormBillTo;
  products: Product[];
  settings: CompanySettings;
  logo?: string | null;
  /** The draft being edited; a new invoice starts with one line of the whole value. */
  invoice?: InvoiceDetail | null;
  onSave: (lines: InvoiceLineInput[]) => Promise<InvoiceDetail>;
  onIssue: (invoice: InvoiceDetail, issueDate: string) => Promise<void>;
  onCancel: () => void;
}

interface DraftLine {
  key: number;
  productId: number | null;
  description: string;
  quantity: string;
  price: string;
}

let nextKey = 1;

function draftFrom(
  invoice: InvoiceDetail | null | undefined,
  deal: InvoiceFormDeal,
): DraftLine[] {
  if (!invoice) {
    return [
      {
        key: nextKey++,
        productId: null,
        description: deal.name,
        quantity: "1",
        price: formatUsdWithCents(deal.value_cents),
      },
    ];
  }
  return invoice.lines.map((line) => ({
    key: nextKey++,
    productId: line.product_id,
    description: line.description,
    quantity: String(line.quantity),
    price: formatUsdWithCents(line.unit_price_cents),
  }));
}

function parseLine(line: DraftLine): InvoiceLineInput | null {
  const quantity = parseQuantity(line.quantity);
  const price = parseUsdToCents(line.price);
  if (problemOf(line) !== null || quantity === null || price === null) {
    return null;
  }
  return {
    product_id: line.productId,
    description: line.description.trim(),
    quantity,
    unit_price_cents: price,
  };
}

/** Why a line can't be saved yet, or null when it can. */
function problemOf(line: DraftLine): string | null {
  if (!line.description.trim()) {
    return "Each line needs a description.";
  }
  if (parseQuantity(line.quantity) === null) {
    return QUANTITY_MESSAGE;
  }
  const price = parseUsdToCents(line.price);
  if (price === null || price < 0 || price > MAX_AMOUNT_CENTS) {
    return AMOUNT_MESSAGE;
  }
  return null;
}

function plusDays(isoDate: string, days: number): string {
  const day = new Date(`${isoDate}T00:00:00`);
  day.setDate(day.getDate() + days);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/**
 * The invoice's editor: the lines and their allocation on one side and the
 * live document on the other, the way the customer will get it. The backend
 * works out what it saves; the sums here only follow the typing.
 */
export default function InvoiceForm({
  deal,
  billTo,
  products,
  settings,
  logo,
  invoice,
  onSave,
  onIssue,
  onCancel,
}: InvoiceFormProps) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    draftFrom(invoice, deal),
  );
  const [issueDate, setIssueDate] = useState(todayIso);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const parsed = lines.map(parseLine);
  const sums = totals(
    parsed.filter((line): line is InvoiceLineInput => line !== null),
    settings.tax_rate_thousandths,
  );
  const stillToAllocate = deal.value_cents - sums.subtotal_cents;
  const overLimit =
    sums.subtotal_cents > MAX_AMOUNT_CENTS ||
    sums.tax_cents > MAX_AMOUNT_CENTS ||
    sums.total_cents > MAX_AMOUNT_CENTS;
  const problem =
    lines.map(problemOf).find((found) => found !== null) ??
    (overLimit ? AMOUNT_MESSAGE : null);
  const complete = problem === null && stillToAllocate === 0;

  function update(key: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setSaved(false);
    setError(null);
  }

  function addLine(product: Product) {
    setLines((current) => [
      ...current,
      {
        key: nextKey++,
        productId: product.id,
        description: product.name,
        quantity: "1",
        price: formatUsdWithCents(product.price_cents),
      },
    ]);
  }

  function removeLine(key: number) {
    setLines((current) => current.filter((line) => line.key !== key));
    setSaved(false);
  }

  async function save(): Promise<InvoiceDetail | null> {
    setBusy(true);
    setError(null);
    try {
      const stored = await onSave(
        parsed.filter((line): line is InvoiceLineInput => line !== null),
      );
      // The reply is what the server stored: show that, not what was typed.
      setLines(draftFrom(stored, deal));
      setSaved(true);
      return stored;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the invoice.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveAndIssue() {
    if (!issueDate) {
      setError("Choose an issue date.");
      return;
    }
    // The dialog stays open until the issue is answered: a refusal must reach
    // the person, who would otherwise close believing the invoice is issued.
    const stored = await save();
    if (!stored) {
      return;
    }
    setBusy(true);
    try {
      await onIssue(stored, issueDate);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not issue the invoice.",
      );
      setBusy(false);
    }
  }

  /** A plain save closes the dialog once the server has stored the lines. */
  async function saveAndClose() {
    const stored = await save();
    if (stored) {
      onCancel();
    }
  }

  const sheet: InvoiceSheet = {
    number: invoice?.number ?? null,
    issue_date: null,
    due_date: null,
    status: "draft",
    bill_to_name: billTo.name,
    bill_to_address: billTo.address,
    bill_to_contact_name: billTo.contactName,
    bill_to_contact_email: billTo.contactEmail,
    lines: parsed.map(
      (line, index) =>
        line ?? {
          description: lines[index].description,
          quantity: 0,
          unit_price_cents: 0,
        },
    ),
    subtotal_cents: sums.subtotal_cents,
    tax_label: settings.tax_label,
    tax_rate_thousandths: settings.tax_rate_thousandths,
    tax_cents: sums.tax_cents,
    total_cents: sums.total_cents,
  };

  return (
    <Modal
      title={invoice ? "Edit invoice" : "Create invoice"}
      onClose={onCancel}
      wide
    >
      <div className="document-editor">
        <form
          className="record-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (complete && !busy) {
              void saveAndClose();
            }
          }}
        >
          <p className="invoice-allocation">
            <span>
              Deal value{" "}
              <span className="num">
                {formatUsdWithCents(deal.value_cents)}
              </span>
            </span>
            <span>
              Subtotal{" "}
              <span className="num">
                {formatUsdWithCents(sums.subtotal_cents)}
              </span>
            </span>
            <span>
              Still to allocate{" "}
              <span className="num">{formatUsdWithCents(stillToAllocate)}</span>
            </span>
          </p>
          <table className="invoice-line-table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">Amount</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const parsedLine = parsed[index];
                const amount =
                  parsedLine === null
                    ? null
                    : parsedLine.quantity * parsedLine.unit_price_cents;
                return (
                  <tr key={line.key}>
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`line-${line.key}`}
                      >
                        Description
                      </label>
                      <input
                        id={`line-${line.key}`}

                        value={line.description}
                        onChange={(event) =>
                          update(line.key, { description: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`qty-${line.key}`}
                      >
                        Quantity
                      </label>
                      <input
                        id={`qty-${line.key}`}
                        className="line-quantity"
                        value={line.quantity}
                        onChange={(event) =>
                          update(line.key, { quantity: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`price-${line.key}`}
                      >
                        Unit price
                      </label>
                      <input
                        id={`price-${line.key}`}
                        className="line-price"
                        value={line.price}
                        onChange={(event) =>
                          update(line.key, { price: event.target.value })
                        }
                      />
                    </td>
                    <td className="num">
                      {amount === null ? "—" : formatUsdWithCents(amount)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${line.description || "line"}`}
                        onClick={() => removeLine(line.key)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="invoice-add-line">
            <label className="field-label" htmlFor="add-line-product">
              Add a line from a product
            </label>
            <select
              id="add-line-product"
              className="filter-select"
              value=""
              onChange={(event) => {
                const product = products.find(
                  (candidate) => candidate.id === Number(event.target.value),
                );
                if (product) {
                  addLine(product);
                }
              }}
            >
              <option value="">Choose a product</option>
              {products
                .filter((product) => product.active)
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {formatUsdWithCents(product.price_cents)}
                  </option>
                ))}
            </select>
          </div>
          {problem ? (
            <p className="form-error" role="alert">
              {problem}
            </p>
          ) : null}
          <Field
            label="Issue date"
            hint={`Due ${formatDate(plusDays(issueDate, settings.payment_terms_days))} from the payment terms.`}
          >
            <input
              type="date"

              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Close
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!complete || busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!complete || busy}
              onClick={() => void saveAndIssue()}
            >
              Save and issue
            </button>
          </div>
          {saved ? (
            <p className="muted" role="status">
              Saved.
            </p>
          ) : null}
        </form>
        <InvoicePreview invoice={sheet} settings={settings} logo={logo} />
      </div>
    </Modal>
  );
}
