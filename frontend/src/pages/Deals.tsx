import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, type Deal, type DealInput } from "../api/client";
import { invoicesApi } from "../api/invoices";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable from "../components/DataTable";
import DealForm from "../components/DealForm";
import { cascadePreview } from "../lib/cascade";
import { formatDate } from "../lib/dates";
import { formatUsd } from "../lib/money";
import { isLate, STAGES } from "../lib/pipeline";

export default function Deals() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: api.deals.list });
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list(),
  });

  const deals = dealsQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  // The Organization and Contact cells read from these two lists, and TanStack
  // caches a cell's value on its row's first render — a row built while a list
  // was still loading would keep "—" for good, so the table waits for all
  // three queries rather than painting cells that can't catch up.
  const tableLoading =
    dealsQuery.isLoading ||
    organizationsQuery.isLoading ||
    contactsQuery.isLoading;
  const [searchParams, setSearchParams] = useSearchParams();
  // The add modal is driven by ?new=1 rather than local state: a search-param
  // change on this route never remounts the page, so state alone would leave
  // the top-bar "New deal" action dead once you are already on /deals.
  const adding = searchParams.get("new") === "1";
  const [editing, setEditing] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openAdd = () => setSearchParams({ new: "1" });
  const closeAdd = () => {
    if (searchParams.has("new")) {
      setSearchParams({}, { replace: true });
    }
  };

  const organizationName = (organizationId: number): string =>
    organizations.find((organization) => organization.id === organizationId)
      ?.name ?? "—";
  const contactName = (contactId: number | null): string =>
    contacts.find((contact) => contact.id === contactId)?.name ?? "—";

  const columns: ColumnDef<Deal>[] = [
    { accessorKey: "name", header: "Name" },
    {
      id: "organization",
      accessorFn: (row) => organizationName(row.organization_id),
      header: "Organization",
    },
    {
      id: "contact",
      accessorFn: (row) => contactName(row.contact_id),
      header: "Contact",
    },
    {
      accessorKey: "stage",
      header: "Stage",
      cell: (info) => (
        <span className={`badge badge-${info.getValue() as string}`}>
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "value_cents",
      header: "Value",
      cell: (info) => (
        <span className="num">{formatUsd(info.getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "probability",
      header: "Probability",
      cell: (info) => <span className="num">{info.getValue() as number}%</span>,
    },
    {
      accessorKey: "close_date",
      header: "Close date",
      cell: ({ row }) => {
        // An open deal past its close date stands out here, as on its card.
        const late = isLate(row.original);
        return late ? (
          <span className="late-date">
            {formatDate(row.original.close_date)}
            <span className="late-pill">Late</span>
          </span>
        ) : (
          formatDate(row.original.close_date)
        );
      },
    },
  ];

  const refreshDeals = () =>
    queryClient.invalidateQueries({ queryKey: ["deals"] });

  // A delete, and a stage change through the edit dialog, both touch the
  // activity list the delete preview is built from.
  const refreshDealsAndActivities = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);

  const handleCreate = async (payload: DealInput) => {
    await api.deals.create(payload);
    await refreshDeals();
    closeAdd();
  };

  const handleUpdate = async (payload: DealInput) => {
    if (!editing) {
      return;
    }
    await api.deals.update(editing.id, payload);
    await refreshDealsAndActivities();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.deals.remove(deleting.id);
      await refreshDealsAndActivities();
      setDeleting(null);
      setDeleteError(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete the deal.",
      );
    }
  };

  return (
    <div>
      <h1>Deals</h1>
      <div className="panel">
        {dealsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load deals.
          </p>
        ) : tableLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <DataTable
            rows={deals}
            columns={columns}
            searchFields={(row) => [
              row.name,
              organizationName(row.organization_id),
              contactName(row.contact_id),
            ]}
            searchPlaceholder="Search deals"
            addLabel="Add deal"
            filter={{
              columnId: "stage",
              label: "Stage",
              options: STAGES.map((stage) => ({ value: stage, label: stage })),
            }}
            onAdd={openAdd}
            onEdit={setEditing}
            onDelete={(deal) => {
              setDeleteError(null);
              setDeleting(deal);
            }}
            onOpen={(row) => navigate(`/deals/${row.id}`)}
          />
        )}
      </div>

      {adding ? (
        <DealForm
          organizations={organizations}
          contacts={contacts}
          onSubmit={handleCreate}
          onCancel={closeAdd}
        />
      ) : null}
      {editing ? (
        <DealForm
          organizations={organizations}
          contacts={contacts}
          deal={editing}
          valueLocked={invoices.some(
            (invoice) =>
              invoice.deal_id === editing.id && invoice.status !== "void",
          )}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This cannot be undone."
          groups={cascadePreview("deal", deleting.id, {
            contacts: [],
            deals: [],
            activities,
          })}
          error={deleteError}
          onConfirm={() => {
            void handleDelete();
          }}
          onCancel={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
        />
      ) : null}
    </div>
  );
}
