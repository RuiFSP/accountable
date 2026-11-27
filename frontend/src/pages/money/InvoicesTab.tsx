import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Invoice, InvoiceStatus } from "../../api/client";
import { downloadPdf, invoicesApi } from "../../api/invoices";
import ConfirmDialog from "../../components/ConfirmDialog";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../lib/dates";
import { statusLabel, statusTone } from "../../lib/invoice";
import { formatUsdWithCents } from "../../lib/money";

const STATUSES: InvoiceStatus[] = [
  "draft",
  "issued",
  "part paid",
  "paid",
  "overdue",
  "void",
];

/** The Invoices tab: every invoice, with only the actions its state allows. */
export default function InvoicesTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list(),
  });
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invoices = invoicesQuery.data ?? [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
    ]);

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await invoicesApi.remove(deleting.id);
      await refresh();
      setDeleting(null);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete the invoice.",
      );
    }
  };

  const handleVoid = async () => {
    if (!voiding) {
      return;
    }
    try {
      await invoicesApi.void(voiding.id);
      await refresh();
      setVoiding(null);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not void the invoice.",
      );
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: "number",
      header: "Number",
      cell: (info) => info.getValue<string | null>() ?? "—",
    },
    { accessorKey: "organization_name", header: "Organization" },
    { accessorKey: "deal_name", header: "Deal" },
    {
      accessorKey: "issue_date",
      header: "Issued",
      cell: (info) => {
        const date = info.getValue<string | null>();
        return date ? formatDate(date) : "—";
      },
    },
    {
      accessorKey: "due_date",
      header: "Due",
      cell: (info) => {
        const date = info.getValue<string | null>();
        return date ? formatDate(date) : "—";
      },
    },
    {
      accessorKey: "total_cents",
      header: "Total",
      cell: (info) => (
        <span className="num">
          {formatUsdWithCents(info.getValue<number>())}
        </span>
      ),
    },
    {
      accessorKey: "balance_cents",
      header: "Balance",
      cell: (info) => {
        const balance = info.getValue<number | null>();
        return (
          <span className="num">
            {balance === null ? "—" : formatUsdWithCents(balance)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => {
        const status = info.getValue<InvoiceStatus>();
        return (
          <StatusBadge tone={statusTone(status)}>
            {statusLabel(status)}
          </StatusBadge>
        );
      },
    },
  ];

  return (
    <section className="panel">
      {invoicesQuery.isError ? (
        <p className="form-error" role="alert">
          Could not load invoices.
        </p>
      ) : invoicesQuery.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <DataTable
          rows={invoices}
          columns={columns}
          searchFields={(row) => [
            row.number,
            row.organization_name,
            row.deal_name,
          ]}
          searchPlaceholder="Search invoices"
          emptyMessage="No invoices yet."
          filter={{
            columnId: "status",
            label: "Status",
            options: STATUSES.map((status) => ({
              value: status,
              label: statusLabel(status),
            })),
          }}
          onOpen={(row) => navigate(`/money/invoices/${row.id}`)}
          rowAction={(row) => (
            <>
              {row.status === "draft" ? (
                <>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => navigate(`/money/invoices/${row.id}?edit=1`)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-button link-danger"
                    onClick={() => {
                      setError(null);
                      setDeleting(row);
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : null}
              {row.status !== "draft" &&
              row.status !== "void" &&
              row.paid_cents === 0 ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setError(null);
                    setVoiding(row);
                  }}
                >
                  Void
                </button>
              ) : null}
              {row.status !== "draft" ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void downloadPdf(row)}
                >
                  Download PDF
                </button>
              ) : null}
            </>
          )}
        />
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.number ?? "this draft"}?`}
          message="Its lines go with it. This cannot be undone."
          groups={[]}
          error={error}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            setDeleting(null);
            setError(null);
          }}
        />
      ) : null}
      {voiding ? (
        <ConfirmDialog
          title={`Void ${voiding.number ?? "this invoice"}?`}
          message="The number stays and the invoice is kept for the record."
          groups={[]}
          error={error}
          confirmLabel="Void"
          onConfirm={() => void handleVoid()}
          onCancel={() => {
            setVoiding(null);
            setError(null);
          }}
        />
      ) : null}
    </section>
  );
}
