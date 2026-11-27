import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { Organization } from "../../api/client";
import { invoicesApi } from "../../api/invoices";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../lib/dates";
import { statusLabel, statusTone } from "../../lib/invoice";
import { formatUsdWithCents } from "../../lib/money";

/** The organization's invoices, void ones included, each opening its page. */
export default function OrganizationInvoices({
  record,
}: {
  record: Organization;
}) {
  const invoicesQuery = useQuery({
    queryKey: ["invoices", "organization", record.id],
    queryFn: () => invoicesApi.list({ organization_id: record.id }),
  });
  const invoices = invoicesQuery.data ?? [];

  return (
    <section className="panel invoice-panel">
      <div className="panel-heading">
        <h2>
          Invoices <span className="count num">{invoices.length}</span>
        </h2>
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
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col">Number</th>
              <th scope="col">Deal</th>
              <th scope="col">Issued</th>
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
                <td>{invoice.deal_name}</td>
                <td>
                  {invoice.issue_date ? formatDate(invoice.issue_date) : "—"}
                </td>
                <td className="num">
                  {formatUsdWithCents(invoice.total_cents)}
                </td>
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
      )}
    </section>
  );
}
