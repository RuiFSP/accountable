import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  api,
  logoDataUrl,
  type InvoiceDetail,
  type InvoiceLineInput,
  type Payment,
  type PaymentInput,
  type PaymentMethod,
} from "../../api/client";
import { downloadPdf, invoicesApi } from "../../api/invoices";
import ConfirmDialog from "../../components/ConfirmDialog";
import Field from "../../components/Field";
import InvoiceForm from "../../components/InvoiceForm";
import InvoicePreview, {
  type InvoiceSheet,
} from "../../components/InvoicePreview";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { formatDate, todayIso } from "../../lib/dates";
import {
  PAYMENT_METHODS,
  paymentMethodLabel,
  statusLabel,
  statusTone,
} from "../../lib/invoice";
import { formatUsdWithCents, parseUsdToCents } from "../../lib/money";

const AMOUNT_INVALID = "Enter an amount in US dollars, for example 1,250.00.";

function sheetOf(invoice: InvoiceDetail): InvoiceSheet {
  return {
    number: invoice.number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    status: invoice.status,
    bill_to_name: invoice.bill_to_name,
    bill_to_address: invoice.bill_to_address,
    bill_to_contact_name: invoice.bill_to_contact_name,
    bill_to_contact_email: invoice.bill_to_contact_email,
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
    })),
    subtotal_cents: invoice.subtotal_cents,
    tax_label: invoice.tax_label,
    tax_rate_thousandths: invoice.tax_rate_thousandths,
    tax_cents: invoice.tax_cents,
    total_cents: invoice.total_cents,
  };
}

/** Paid against still owed, named in text as well as drawn. */
function PaidBar({ invoice }: { invoice: InvoiceDetail }) {
  const owed = invoice.balance_cents ?? 0;
  const share =
    invoice.total_cents === 0
      ? 0
      : Math.round((invoice.paid_cents / invoice.total_cents) * 100);
  return (
    <div className="paid-block">
      <div
        className="paid-bar"
        role="progressbar"
        aria-label="Paid against the total"
        aria-valuemin={0}
        aria-valuemax={invoice.total_cents}
        aria-valuenow={invoice.paid_cents}
      >
        <span className="paid-bar-fill" style={{ width: `${share}%` }} />
      </div>
      <p className="paid-summary">
        <span>
          Paid{" "}
          <span className="num">{formatUsdWithCents(invoice.paid_cents)}</span>{" "}
          of{" "}
          <span className="num">{formatUsdWithCents(invoice.total_cents)}</span>
        </span>
        <span>
          Still owed <span className="num">{formatUsdWithCents(owed)}</span>
        </span>
      </p>
    </div>
  );
}

/** The actions the invoice's state allows, and nothing that would be refused. */
function InvoiceActions({
  invoice,
  onEdit,
  onDelete,
  onVoid,
  onPay,
}: {
  invoice: InvoiceDetail;
  onEdit: () => void;
  onDelete: () => void;
  onVoid: () => void;
  onPay: () => void;
}) {
  const isDraft = invoice.status === "draft";
  const isVoid = invoice.status === "void";
  const owes = (invoice.balance_cents ?? 0) > 0;
  return (
    <div className="invoice-actions">
      {isDraft ? (
        <button type="button" className="btn" onClick={onEdit}>
          Edit
        </button>
      ) : null}
      {isDraft ? (
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
      ) : null}
      {!isDraft && !isVoid && owes ? (
        <button type="button" className="btn btn-primary" onClick={onPay}>
          Record payment
        </button>
      ) : null}
      {!isDraft && !isVoid && invoice.paid_cents === 0 ? (
        <button type="button" className="btn" onClick={onVoid}>
          Void
        </button>
      ) : null}
      {!isDraft ? (
        <button
          type="button"
          className="btn"
          onClick={() => void downloadPdf(invoice)}
        >
          Download PDF
        </button>
      ) : null}
    </div>
  );
}

type Confirming =
  | { action: "delete" }
  | { action: "void" }
  | { action: "payment"; payment: Payment }
  | null;

/** The three confirmations the page asks for: delete, void and a payment. */
function InvoiceConfirms({
  invoice,
  confirming,
  error,
  onConfirm,
  onClose,
}: {
  invoice: InvoiceDetail;
  confirming: Confirming;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (confirming === null) {
    return null;
  }
  if (confirming.action === "payment") {
    const payment = confirming.payment;
    return (
      <ConfirmDialog
        title="Delete payment?"
        message={`${formatUsdWithCents(payment.amount_cents)} on ${formatDate(
          payment.paid_on,
        )}. The balance goes back up.`}
        groups={[]}
        error={error}
        onConfirm={onConfirm}
        onCancel={onClose}
      />
    );
  }
  if (confirming.action === "void") {
    return (
      <ConfirmDialog
        title={`Void ${invoice.number ?? "this invoice"}?`}
        message="The number stays and the invoice is kept for the record."
        groups={[]}
        error={error}
        confirmLabel="Void"
        onConfirm={onConfirm}
        onCancel={onClose}
      />
    );
  }
  return (
    <ConfirmDialog
      title={`Delete ${invoice.number ?? "this draft"}?`}
      message="Its lines go with it. This cannot be undone."
      groups={[]}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

interface PaymentDialogProps {
  invoice: InvoiceDetail;
  onRecord: (payload: PaymentInput) => Promise<void>;
  onCancel: () => void;
}

function PaymentDialog({ invoice, onRecord, onCancel }: PaymentDialogProps) {
  const [amount, setAmount] = useState(
    formatUsdWithCents(invoice.balance_cents ?? 0),
  );
  const [paidOn, setPaidOn] = useState(todayIso);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = parseUsdToCents(amount);
    if (amountCents === null || amountCents <= 0) {
      setError(AMOUNT_INVALID);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onRecord({
        paid_on: paidOn,
        amount_cents: amountCents,
        method,
        reference: reference.trim() || null,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record the payment.",
      );
      setBusy(false);
    }
  };

  return (
    <Modal title="Record payment" onClose={onCancel}>
      <form className="record-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <Field label="Amount (USD)">
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Paid on">
            <input
              type="date"
              required
              max={todayIso()}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Method">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((option) => (
              <option key={option} value={option}>
                {paymentMethodLabel(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference" hint="Optional, such as a transfer's number.">
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Recording…" : "Record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentsPanel({
  invoice,
  onDelete,
}: {
  invoice: InvoiceDetail;
  onDelete: (payment: Payment) => void;
}) {
  return (
    <section className="panel">
      <h2>
        Payments <span className="count num">{invoice.payments.length}</span>
      </h2>
      {invoice.payments.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
              <th scope="col">Method</th>
              <th scope="col">Reference</th>
              <th scope="col">Entered by</th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{formatDate(payment.paid_on)}</td>
                <td className="num">
                  {formatUsdWithCents(payment.amount_cents)}
                </td>
                <td>{paymentMethodLabel(payment.method)}</td>
                <td>{payment.reference ?? "—"}</td>
                <td>{payment.created_by ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    className="link-button link-danger"
                    onClick={() => onDelete(payment)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** One invoice: the document, what is paid and what is still owed, its payments. */
export default function InvoicePage() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = searchParams.get("edit") === "1";

  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });
  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => api.products.list(),
  });
  const logoQuery = useQuery({
    queryKey: ["logo"],
    queryFn: logoDataUrl,
    staleTime: Infinity,
  });

  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);

  const invoice = invoiceQuery.data;
  const settings = settingsQuery.data;
  const products = productsQuery.data;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] }),
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);

  if (invoiceQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }
  if (!invoice) {
    return (
      <div>
        <h2>Invoice not found</h2>
        <Link className="back-link" to="/money/invoices">
          ← Invoices
        </Link>
      </div>
    );
  }

  const openEdit = () => {
    const next = new URLSearchParams(searchParams);
    next.set("edit", "1");
    setSearchParams(next);
  };
  const closeEdit = () => {
    if (searchParams.get("edit") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
  };

  const handleSave = async (lines: InvoiceLineInput[]) => {
    // The form closes the editor once this resolves; an issue that follows
    // must still have somewhere to show a refusal.
    const stored = await invoicesApi.update(invoice.id, lines);
    await refresh();
    return stored;
  };
  const ask = (next: Confirming) => {
    setError(null);
    setConfirming(next);
  };
  const handleIssue = async (stored: InvoiceDetail, issueDate: string) => {
    await invoicesApi.issue(stored.id, issueDate);
    await refresh();
    closeEdit();
  };
  const handleRecord = async (payload: PaymentInput) => {
    await invoicesApi.recordPayment(invoice.id, payload);
    await refresh();
    setPaying(false);
  };
  const handleConfirm = async () => {
    if (confirming === null) {
      return;
    }
    setError(null);
    try {
      if (confirming.action === "delete") {
        await invoicesApi.remove(invoice.id);
        await refresh();
        navigate("/money/invoices");
        return;
      }
      if (confirming.action === "void") {
        await invoicesApi.void(invoice.id);
      } else {
        await invoicesApi.deletePayment(invoice.id, confirming.payment.id);
      }
      await refresh();
      setConfirming(null);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The action was refused.",
      );
    }
  };

  return (
    <div>
      <Link className="back-link" to="/money/invoices">
        ← Invoices
      </Link>
      <div className="page-title">
        <h2>{invoice.number ?? "Draft invoice"}</h2>
        <StatusBadge tone={statusTone(invoice.status)}>
          {statusLabel(invoice.status)}
        </StatusBadge>
      </div>
      <p className="muted">
        <Link to={`/organizations/${invoice.organization_id}`}>
          {invoice.organization_name}
        </Link>{" "}
        · <Link to={`/deals/${invoice.deal_id}`}>{invoice.deal_name}</Link>
      </p>

      <InvoiceActions
        invoice={invoice}
        onEdit={openEdit}
        onDelete={() => ask({ action: "delete" })}
        onVoid={() => ask({ action: "void" })}
        onPay={() => setPaying(true)}
      />

      {invoice.status !== "draft" && invoice.status !== "void" ? (
        <PaidBar invoice={invoice} />
      ) : null}

      <div className="invoice-document">
        {settings ? (
          <InvoicePreview
            invoice={sheetOf(invoice)}
            settings={settings}
            logo={logoQuery.data ?? null}
          />
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>

      <PaymentsPanel
        invoice={invoice}
        onDelete={(payment) => ask({ action: "payment", payment })}
      />

      {editing && settings && products ? (
        <InvoiceForm
          deal={{
            id: invoice.deal_id,
            name: invoice.deal_name,
            value_cents: invoice.subtotal_cents,
          }}
          billTo={{
            name: invoice.bill_to_name,
            address: invoice.bill_to_address,
            contactName: invoice.bill_to_contact_name,
            contactEmail: invoice.bill_to_contact_email,
          }}
          products={products}
          settings={settings}
          logo={logoQuery.data ?? null}
          invoice={invoice}
          onSave={handleSave}
          onIssue={handleIssue}
          onCancel={closeEdit}
        />
      ) : null}

      {paying ? (
        <PaymentDialog
          invoice={invoice}
          onRecord={handleRecord}
          onCancel={() => setPaying(false)}
        />
      ) : null}

      <InvoiceConfirms
        invoice={invoice}
        confirming={confirming}
        error={error}
        onConfirm={() => void handleConfirm()}
        onClose={() => {
          setConfirming(null);
          setError(null);
        }}
      />
    </div>
  );
}
