import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  api,
  logoDataUrl,
  type Deal,
  type Invoice,
  type InvoiceDetail,
  type InvoiceLineInput,
} from "../../api/client";
import { invoicesApi } from "../../api/invoices";
import InvoiceForm from "../../components/InvoiceForm";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../lib/dates";
import { statusLabel, statusTone } from "../../lib/invoice";
import { formatUsdWithCents } from "../../lib/money";

/** The deal's invoices in short: number, dates, what is owed and its status. */
export function InvoiceRows({ invoices }: { invoices: Invoice[] }) {
  return (
    <table className="mini-table">
      <thead>
        <tr>
          <th scope="col">Number</th>
          <th scope="col">Issued</th>
          <th scope="col">Due</th>
          <th scope="col">Total</th>
          <th scope="col">Balance</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id}>
            <td>
              <Link to={`/money/invoices/${invoice.id}`}>
                {invoice.number ?? "Draft"}
              </Link>
            </td>
            <td>{invoice.issue_date ? formatDate(invoice.issue_date) : "—"}</td>
            <td>{invoice.due_date ? formatDate(invoice.due_date) : "—"}</td>
            <td className="num">{formatUsdWithCents(invoice.total_cents)}</td>
            <td className="num">
              {invoice.balance_cents === null
                ? "—"
                : formatUsdWithCents(invoice.balance_cents)}
            </td>
            <td>
              <StatusBadge tone={statusTone(invoice.status)}>
                {statusLabel(invoice.status)}
              </StatusBadge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface CreateInvoiceProps {
  deal: Deal;
  onCancel: () => void;
}

/** The wide dialog: the form beside its live preview, wired to the deal. */
function CreateInvoice({ deal, onCancel }: CreateInvoiceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => api.products.list(),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });
  const logoQuery = useQuery({
    queryKey: ["logo"],
    queryFn: logoDataUrl,
    staleTime: Infinity,
  });

  const settings = settingsQuery.data;
  const products = productsQuery.data;
  const organizations = organizationsQuery.data;
  const contacts = contactsQuery.data;
  const loading =
    !settings ||
    !products ||
    organizations === undefined ||
    contacts === undefined;
  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
    ]);

  const handleSave = async (lines: InvoiceLineInput[]) => {
    // The form closes the dialog once this resolves; an issue that follows
    // must still have somewhere to show a refusal.
    const stored = await invoicesApi.create({ deal_id: deal.id, lines });
    await refresh();
    return stored;
  };
  const handleIssue = async (invoice: InvoiceDetail, issueDate: string) => {
    await invoicesApi.issue(invoice.id, issueDate);
    await refresh();
    onCancel();
    navigate(`/money/invoices/${invoice.id}`);
  };

  return (
    <InvoiceForm
      deal={deal}
      billTo={billToFor(deal, organizations, contacts)}
      products={products}
      settings={settings}
      logo={logoQuery.data ?? null}
      onSave={handleSave}
      onIssue={handleIssue}
      onCancel={onCancel}
    />
  );
}

/**
 * The deal's invoices, with Create invoice on a won deal that has no non-void
 * one. The dialog lives in the route's query, like New deal, so a refresh or
 * a revisited link reopens it.
 */
export default function DealInvoices({ record }: { record: Deal }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const creating = searchParams.get("invoice") === "new";

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "deal", record.id],
    queryFn: () => invoicesApi.list({ deal_id: record.id }),
  });
  const invoices = invoicesQuery.data ?? [];
  const canCreate =
    record.stage === "Won" &&
    !invoices.some((invoice) => invoice.status !== "void");

  const openCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.set("invoice", "new");
    setSearchParams(next);
  };
  const closeCreate = () => {
    if (searchParams.get("invoice") === "new") {
      const next = new URLSearchParams(searchParams);
      next.delete("invoice");
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <section className="panel invoice-panel">
      <div className="panel-heading">
        <h2>
          Invoices <span className="count num">{invoices.length}</span>
        </h2>
        {canCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
          >
            Create invoice
          </button>
        ) : null}
      </div>

      {invoicesQuery.isError ? (
        <p className="form-error" role="alert">
          Could not load invoices.
        </p>
      ) : invoicesQuery.isLoading ? (
        <p className="muted">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="muted">No invoices yet.</p>
      ) : (
        <InvoiceRows invoices={invoices} />
      )}

      {creating && canCreate ? (
        <CreateInvoice deal={record} onCancel={closeCreate} />
      ) : null}
    </section>
  );
}

function billToFor(
  deal: Deal,
  organizations: { id: number; name: string; billing_address: string | null }[],
  contacts: { id: number; name: string; email: string | null }[],
) {
  const organization = organizations.find(
    (row) => row.id === deal.organization_id,
  );
  const contact = contacts.find((row) => row.id === deal.contact_id);
  return {
    name: organization?.name ?? null,
    address: organization?.billing_address ?? null,
    contactName: contact?.name ?? null,
    contactEmail: contact?.email ?? null,
  };
}
