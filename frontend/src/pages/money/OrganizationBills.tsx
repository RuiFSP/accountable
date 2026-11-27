import { useQuery } from "@tanstack/react-query";

import { api, type Organization } from "../../api/client";
import StatusBadge from "../../components/StatusBadge";
import { STATUS_TONES } from "../../lib/bills";
import { formatDate } from "../../lib/dates";
import { formatUsd } from "../../lib/money";
import { capitalize } from "../../lib/text";

/** The organization's bills, listed read-only: number, due date, total and
 * status. Marking paid, editing and deleting happen in the Bills tab. */
export default function OrganizationBills({
  record,
}: {
  record: Organization;
}) {
  const billsQuery = useQuery({
    queryKey: ["bills", "organization", record.id],
    queryFn: () => api.bills.list(undefined, undefined, record.id),
  });

  const bills = billsQuery.data ?? [];

  return (
    <section className="panel">
      <h2>
        Bills <span className="count num">{bills.length}</span>
      </h2>
      {billsQuery.isLoading ? (
        <p className="muted">Loading…</p>
      ) : billsQuery.isError ? (
        <p className="form-error" role="alert">
          Could not load bills.
        </p>
      ) : bills.length === 0 ? (
        <p className="muted">No bills yet.</p>
      ) : (
        <ul className="link-list">
          {bills.map((bill) => (
            <li key={bill.id}>
              <span>{bill.bill_number}</span>
              <span className="muted">{formatDate(bill.due_date)}</span>
              <span className="num">{formatUsd(bill.total_cents)}</span>
              <StatusBadge tone={STATUS_TONES[bill.status]}>
                {capitalize(bill.status)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
