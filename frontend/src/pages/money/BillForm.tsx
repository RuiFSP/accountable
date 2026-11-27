import { type FormEvent, useState } from "react";

import {
  type Bill,
  type BillCategory,
  type BillInput,
  type Organization,
} from "../../api/client";
import Field from "../../components/Field";
import Modal from "../../components/Modal";
import RecordAttribution from "../../components/RecordAttribution";
import { BILL_CATEGORIES } from "../../lib/bills";
import { isoAddDays, isoToday } from "../../lib/dates";
import { formatUsdWithCents, parseUsdToCents } from "../../lib/money";

interface BillFormProps {
  organizations: Pick<Organization, "id" | "name">[];
  bill?: Bill;
  onSubmit: (payload: BillInput) => Promise<void>;
  onCancel: () => void;
}

function initialOrganizationId(
  bill: Bill | undefined,
  organizations: Pick<Organization, "id" | "name">[],
): string {
  return String(bill?.organization_id ?? organizations[0]?.id ?? "");
}

function initialMoney(cents: number | undefined): string {
  return cents === undefined ? "" : formatUsdWithCents(cents);
}

function initialFormState(
  bill: Bill | undefined,
  organizations: Pick<Organization, "id" | "name">[],
) {
  return {
    organizationId: initialOrganizationId(bill, organizations),
    billNumber: bill?.bill_number ?? "",
    billDate: bill?.bill_date ?? isoToday(),
    dueDate: bill?.due_date ?? isoAddDays(isoToday(), 30),
    // A stored due date stands until changed by hand; a new bill's due date
    // keeps following the bill date until the user edits it.
    dueEdited: Boolean(bill),
    amountText: initialMoney(bill?.amount_cents),
    taxText: initialMoney(bill?.tax_cents),
    category: bill?.category ?? "Software",
    notes: bill?.notes ?? "",
  };
}

export default function BillForm({
  organizations,
  bill,
  onSubmit,
  onCancel,
}: BillFormProps) {
  const initial = initialFormState(bill, organizations);
  const [organizationId, setOrganizationId] = useState(initial.organizationId);
  const [billNumber, setBillNumber] = useState(initial.billNumber);
  const [billDate, setBillDate] = useState(initial.billDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [dueEdited, setDueEdited] = useState(initial.dueEdited);
  const [amountText, setAmountText] = useState(initial.amountText);
  const [taxText, setTaxText] = useState(initial.taxText);
  const [category, setCategory] = useState<BillCategory>(initial.category);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseUsdToCents(amountText) ?? 0;
  const taxCents = parseUsdToCents(taxText) ?? 0;

  const changeBillDate = (value: string) => {
    setBillDate(value);
    if (!dueEdited && value) {
      setDueDate(isoAddDays(value, 30));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = parseUsdToCents(amountText);
    const tax = parseUsdToCents(taxText);
    if (amount === null) {
      setError("Enter an amount in US dollars, for example 49.50.");
      return;
    }
    if (tax === null) {
      setError("Enter tax in US dollars, for example 4.95.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        organization_id: Number(organizationId),
        bill_number: billNumber.trim(),
        bill_date: billDate,
        due_date: dueDate || null,
        category,
        amount_cents: amount,
        tax_cents: tax,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the bill.");
    }
  };

  return (
    <Modal title={bill ? "Edit bill" : "Add bill"} onClose={onCancel}>
      <form className="record-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <Field label="Supplier">
            <select
              required
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bill number">
            <input
              required
              value={billNumber}
              onChange={(event) => setBillNumber(event.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Bill date">
            <input
              required
              type="date"
              value={billDate}
              onChange={(event) => changeBillDate(event.target.value)}
            />
          </Field>
          <Field label="Due date">
            <input
              required
              type="date"
              value={dueDate}
              onChange={(event) => {
                setDueEdited(true);
                setDueDate(event.target.value);
              }}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Amount before tax (USD)">
            <input
              required
              inputMode="decimal"
              placeholder="49.50"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          </Field>
          <Field label="Tax (USD)">
            <input
              required
              inputMode="decimal"
              placeholder="4.95"
              value={taxText}
              onChange={(event) => setTaxText(event.target.value)}
            />
          </Field>
        </div>
        <p className="muted">
          Total: {formatUsdWithCents(amountCents + taxCents)}
        </p>
        <Field label="Category">
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as BillCategory)
            }
          >
            {BILL_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        {bill ? (
          <dl className="detail-grid">
            <RecordAttribution
              createdBy={bill.created_by}
              updatedBy={bill.updated_by}
            />
          </dl>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {bill ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
