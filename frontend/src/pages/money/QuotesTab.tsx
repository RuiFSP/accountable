import { type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Link, Route, Routes } from "react-router-dom";

import { api } from "../../api/client";
import type { Quote as QuoteRecord, QuoteStatus } from "../../api/quotes";
import DataTable from "../../components/DataTable";
import KpiCard from "../../components/KpiCard";
import { STATUS_TONES, statusLabel } from "../../components/QuotePanels";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../lib/dates";
import { formatUsdWithCents } from "../../lib/money";
import Quote from "./Quote";

const STATES: QuoteStatus[] = [
  "draft",
  "sent",
  "expired",
  "accepted",
  "declined",
];

const columns: ColumnDef<QuoteRecord>[] = [
  {
    accessorKey: "number",
    header: "Number",
    cell: (info) => (
      <Link to={`/money/quotes/${info.row.original.id}`}>
        {info.getValue() as string}
      </Link>
    ),
  },
  { accessorKey: "deal_name", header: "Deal" },
  {
    accessorKey: "organization_name",
    header: "Organization",
    cell: (info) => (info.getValue() as string | null) ?? "—",
  },
  {
    accessorKey: "status",
    header: "State",
    cell: (info) => {
      const status = info.getValue() as QuoteStatus;
      return (
        <StatusBadge tone={STATUS_TONES[status]}>
          {statusLabel(status)}
        </StatusBadge>
      );
    },
  },
  {
    accessorKey: "valid_until",
    header: "Valid until",
    cell: (info) => formatDate(info.getValue() as string),
  },
  {
    accessorKey: "total_cents",
    header: "Total",
    cell: (info) => (
      <span className="num">
        {formatUsdWithCents(info.getValue() as number)}
      </span>
    ),
  },
];

function QuoteList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["quotes", {}],
    queryFn: () => api.quotes.list(),
  });

  return (
    <section>
      <h2>Quotes</h2>
      {isError ? (
        <p className="form-error" role="alert">
          Could not load the quotes.
        </p>
      ) : isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {/* Five totals across the top (docs/specs/quotes.md decision 1). */}
          <div className="kpi-grid kpi-grid-five">
            {STATES.map((state) => (
              <KpiCard
                key={state}
                label={statusLabel(state)}
                value={formatUsdWithCents(data?.totals?.[state] ?? 0)}
                note="Including tax"
              />
            ))}
          </div>
          <section className="panel">
            <DataTable
              rows={data?.quotes ?? []}
              columns={columns}
              searchFields={(row) => [
                row.number,
                row.deal_name,
                row.organization_name,
                statusLabel(row.status),
              ]}
              searchPlaceholder="Search quotes"
              emptyMessage="No quotes yet."
            />
          </section>
        </>
      )}
    </section>
  );
}

/** The Quotes tab: the list at quotes/*, and each quote's page under :id. */
export default function QuotesTab() {
  return (
    <Routes>
      <Route index element={<QuoteList />} />
      <Route path=":id" element={<Quote />} />
    </Routes>
  );
}
