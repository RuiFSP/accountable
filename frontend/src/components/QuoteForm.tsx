import { type FormEvent, useState } from "react";

import type { Product } from "../api/client";
import type {
  CompanyBlock,
  QuoteDetail,
  QuoteInput,
  QuoteLineInput,
} from "../api/quotes";
import { formatUsdWithCents, parseUsdToCents } from "../lib/money";
import { formatTaxRate } from "../lib/settings";
import {
  AMOUNT_MESSAGE,
  MAX_AMOUNT_CENTS,
  QUANTITY_MESSAGE,
  lineAmount,
  parseQuantity,
  totals,
} from "../lib/tax";
import Field from "./Field";
import Modal from "./Modal";
import QuoteDocument, { type QuoteDocumentModel } from "./QuoteDocument";

export const NO_LINES_MESSAGE = "A quote needs at least one line.";
export const PRICE_MESSAGE = "Enter a price from $0.00 to $21,474,836.47.";
const PRICE_HINT = "Enter a price in US dollars, for example 49.50.";

interface FormLine {
  product_id: number;
  product_name: string;
  description: string;
  quantityText: string;
  priceText: string;
}

interface QuoteFormProps {
  dealId: number;
  quote?: QuoteDetail;
  products: Product[];
  company: CompanyBlock;
  organizationName: string | null;
  contactName: string | null;
  taxLabel: string | null;
  taxRateThousandths: number;
  onSubmit: (payload: QuoteInput) => Promise<QuoteDetail>;
  /** Called after a save repopulated the form from the saved reply. */
  onSaved?: (saved: QuoteDetail) => void;
  onCancel: () => void;
}

function initialLines(quote?: QuoteDetail): FormLine[] {
  return (quote?.lines ?? []).map((line) => ({
    product_id: line.product_id,
    product_name: line.product_name,
    description: line.description ?? "",
    quantityText: String(line.quantity),
    priceText: formatUsdWithCents(line.unit_price_cents),
  }));
}

function initialValidUntil(quote?: QuoteDetail): string {
  return quote?.valid_until ?? isoDate(30);
}

/** A local "YYYY-MM-DD" date, today or that many days out. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** One form line as the document shows it; untyped fields count as zero. */
function previewLine(line: FormLine): QuoteDocumentModel["lines"][number] {
  return {
    product_name: line.product_name,
    description: line.description.trim() || null,
    quantity: parseQuantity(line.quantityText) ?? 0,
    unit_price_cents: parseUsdToCents(line.priceText) ?? 0,
  };
}

export default function QuoteForm({
  dealId,
  quote,
  products,
  company,
  organizationName,
  contactName,
  taxLabel,
  taxRateThousandths,
  onSubmit,
  onSaved,
  onCancel,
}: QuoteFormProps) {
  const [lines, setLines] = useState<FormLine[]>(() => initialLines(quote));
  const [validUntil, setValidUntil] = useState(() => initialValidUntil(quote));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const active = products.filter((product) => product.active);
  const preview = lines.map(previewLine);
  const sums = totals(preview, taxRateThousandths);

  function change(index: number, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...patch } : line,
      ),
    );
    setSaved(false);
  }

  function addLine(productId: string) {
    const product = active.find((row) => String(row.id) === productId);
    if (!product) {
      return;
    }
    setLines((current) => [
      ...current,
      {
        product_id: product.id,
        product_name: product.name,
        description: product.description ?? "",
        quantityText: "1",
        priceText: formatUsdWithCents(product.price_cents),
      },
    ]);
    setSaved(false);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, position) => position !== index));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildInput(dealId, lines, validUntil);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const reply = await onSubmit(built.input);
      // The reply is what the server stored: show that, not what was typed.
      setLines(initialLines(reply));
      setValidUntil(reply.valid_until);
      setSaved(true);
      onSaved?.(reply);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the quote.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={quote ? "Edit quote" : "New quote"} onClose={onCancel} wide>
      <div className="document-editor">
        <form className="record-form" noValidate onSubmit={handleSubmit}>
          <Field label="Valid until">
            <input
              type="date"
              value={validUntil}
              onChange={(event) => {
                setValidUntil(event.target.value);
                setSaved(false);
              }}
            />
          </Field>
          <div className="quote-form-lines">
            {lines.map((line, index) => (
              <div className="quote-form-line" key={index}>
                <p className="quote-form-line-name">{line.product_name}</p>
                <Field label="Description">
                  <input
                    value={line.description}
                    onChange={(event) =>
                      change(index, { description: event.target.value })
                    }
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    inputMode="numeric"
                    value={line.quantityText}
                    onChange={(event) =>
                      change(index, { quantityText: event.target.value })
                    }
                  />
                </Field>
                <Field label="Unit price (USD)">
                  <input
                    inputMode="decimal"
                    value={line.priceText}
                    onChange={(event) =>
                      change(index, { priceText: event.target.value })
                    }
                  />
                </Field>
                <p className="quote-form-line-amount num">
                  {formatUsdWithCents(lineAmount(preview[index]))}
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => removeLine(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Field label="Product">
            <select value="" onChange={(event) => addLine(event.target.value)}>
              <option value="">Add a product…</option>
              {active.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
          <dl className="quote-form-totals">
            <div>
              <dt>Subtotal</dt>
              <dd className="num">{formatUsdWithCents(sums.subtotal_cents)}</dd>
            </div>
            <div>
              <dt>
                {taxLabel ?? "Tax"} ({formatTaxRate(taxRateThousandths)}%)
              </dt>
              <dd className="num">{formatUsdWithCents(sums.tax_cents)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="num">{formatUsdWithCents(sums.total_cents)}</dd>
            </div>
          </dl>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            {saved ? (
              <p className="muted" role="status">
                Saved.
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : quote ? "Save" : "Add"}
            </button>
          </div>
        </form>
        <QuoteDocument
          document={{
            number: quote?.number ?? null,
            createdAt: quote?.created_at ?? isoDate(0),
            validUntil: validUntil || null,
            taxLabel,
            taxRateThousandths,
            lines: preview,
            company,
            organizationName,
            contactName,
          }}
        />
      </div>
    </Modal>
  );
}

type Built = { input: QuoteInput } | { error: string };

/** The save payload: quantities and unit prices only, never a total. */
function buildInput(
  dealId: number,
  lines: FormLine[],
  validUntil: string,
): Built {
  if (lines.length === 0) {
    return { error: NO_LINES_MESSAGE };
  }
  const checked: QuoteLineInput[] = [];
  let subtotal = 0;
  for (const line of lines) {
    const quantity = parseQuantity(line.quantityText);
    if (quantity === null) {
      return { error: QUANTITY_MESSAGE };
    }
    const price = parseUsdToCents(line.priceText);
    if (price === null) {
      return { error: PRICE_HINT };
    }
    if (price > MAX_AMOUNT_CENTS) {
      return { error: PRICE_MESSAGE };
    }
    const amount = lineAmount({ quantity, unit_price_cents: price });
    if (amount > MAX_AMOUNT_CENTS) {
      return { error: AMOUNT_MESSAGE };
    }
    subtotal += amount;
    checked.push({
      product_id: line.product_id,
      description: line.description.trim() || null,
      quantity,
      unit_price_cents: price,
    });
  }
  if (subtotal > MAX_AMOUNT_CENTS) {
    return { error: AMOUNT_MESSAGE };
  }
  return {
    input: {
      deal_id: dealId,
      valid_until: validUntil || null,
      lines: checked,
    },
  };
}
