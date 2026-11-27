import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  api,
  type Bill,
  type BillInput,
  type BillStatus,
} from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import { CATEGORY_COLORS, STATUS_TONES, billStatus } from "../../lib/bills";
import { formatDate, isoToday } from "../../lib/dates";
import { formatUsd } from "../../lib/money";
import { capitalize } from "../../lib/text";
import BillForm from "./BillForm";

const STATUS_FILTER: { value: BillStatus; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export default function BillsTab() {
  const queryClient = useQueryClient();
  const billsQuery = useQuery({
    queryKey: ["bills"],
    queryFn: () => api.bills.list(),
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [deleting, setDeleting] = useState<Bill | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const bills = billsQuery.data ?? [];

  const columns: ColumnDef<Bill>[] = [
    { accessorKey: "organization_name", header: "Supplier" },
    { accessorKey: "bill_number", header: "Bill number" },
    {
      accessorKey: "bill_date",
      header: "Bill date",
      cell: (info) => formatDate(info.getValue() as string),
    },
    {
      accessorKey: "due_date",
      header: "Due date",
      cell: (info) => formatDate(info.getValue() as string),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: (info) => {
        const category = info.getValue() as Bill["category"];
        return (
          <span>
            <span
              className="category-dot"
              style={{ background: CATEGORY_COLORS[category] }}
              aria-hidden="true"
            />
            {category}
          </span>
        );
      },
    },
    {
      accessorKey: "total_cents",
      header: "Total",
      cell: (info) => (
        <span className="num">{formatUsd(info.getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => {
        const status = info.getValue() as BillStatus;
        return (
          <StatusBadge tone={STATUS_TONES[status]}>
            {capitalize(status)}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: "paid_date",
      header: "Paid",
      cell: (info) =>
        info.getValue() ? formatDate(info.getValue() as string) : "—",
    },
  ];

  const refreshBills = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bills"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);

  const handleCreate = async (payload: BillInput) => {
    await api.bills.create(payload);
    await refreshBills();
    setAdding(false);
  };

  const handleUpdate = async (payload: BillInput) => {
    if (!editing) {
      return;
    }
    await api.bills.update(editing.id, payload);
    await refreshBills();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.bills.remove(deleting.id);
      await refreshBills();
      setDeleting(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete the bill.",
      );
    }
  };

  // The row flips at once; a failed call puts it back and says why.
  const updateRow = (id: number, patch: Partial<Bill>) => {
    queryClient.setQueryData<Bill[]>(["bills"], (rows) =>
      rows?.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const handleMarkPaid = (bill: Bill) => {
    setActionError(null);
    const day = isoToday();
    updateRow(bill.id, {
      paid_date: day,
      status: billStatus({ ...bill, paid_date: day }),
    });
    api.bills.markPaid(bill.id).catch((err) => {
      updateRow(bill.id, { paid_date: bill.paid_date, status: bill.status });
      setActionError(
        err instanceof Error ? err.message : "Could not mark the bill paid.",
      );
    });
  };

  const handleMarkUnpaid = (bill: Bill) => {
    setActionError(null);
    updateRow(bill.id, {
      paid_date: null,
      status: billStatus({ ...bill, paid_date: null }),
    });
    api.bills.markUnpaid(bill.id).catch((err) => {
      updateRow(bill.id, { paid_date: bill.paid_date, status: bill.status });
      setActionError(
        err instanceof Error ? err.message : "Could not mark the bill unpaid.",
      );
    });
  };

  return (
    <div>
      <div className="panel">
        {billsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load bills.
          </p>
        ) : billsQuery.isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            {actionError ? (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <DataTable
              rows={bills}
              columns={columns}
              searchFields={(row) => [row.organization_name, row.bill_number]}
              searchPlaceholder="Search bills"
              addLabel="Add bill"
              emptyMessage="No bills yet."
              filter={{
                columnId: "status",
                label: "Status",
                options: STATUS_FILTER,
              }}
              onAdd={() => setAdding(true)}
              onEdit={setEditing}
              onDelete={(row) => {
                setDeleteError(null);
                setDeleting(row);
              }}
              rowAction={(bill) =>
                bill.status === "paid" ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleMarkUnpaid(bill)}
                  >
                    Mark unpaid
                  </button>
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleMarkPaid(bill)}
                  >
                    Mark paid
                  </button>
                )
              }
            />
          </>
        )}
      </div>

      {adding ? (
        <BillForm
          organizations={organizations}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <BillForm
          organizations={organizations}
          bill={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete bill ${deleting.bill_number}?`}
          message="This cannot be undone."
          groups={[]}
          error={deleteError}
          onConfirm={() => {
            void handleDelete();
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
