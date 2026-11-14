import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, type Deal, type DealInput } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable from "../components/DataTable";
import DealForm from "../components/DealForm";
import { cascadePreview } from "../lib/cascade";
import { formatDate } from "../lib/dates";
import { formatUsd } from "../lib/money";
import { STAGES } from "../lib/pipeline";

export default function Deals() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: api.deals.list });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });

  const deals = dealsQuery.data ?? [];
  const [searchParams, setSearchParams] = useSearchParams();
  const [adding, setAdding] = useState(searchParams.get("new") === "1");
  const [editing, setEditing] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);

  const closeAdd = () => {
    setAdding(false);
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
      cell: (info) => formatDate(info.getValue() as string | null),
    },
  ];

  const refreshDeals = () =>
    queryClient.invalidateQueries({ queryKey: ["deals"] });

  const refreshAfterDelete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);
  };

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
    await refreshDeals();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.deals.remove(deleting.id);
      await refreshAfterDelete();
      setDeleting(null);
    } catch (error) {
      console.error(error);
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
        ) : dealsQuery.isLoading ? (
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
            onAdd={() => setAdding(true)}
            onEdit={setEditing}
            onDelete={setDeleting}
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
          onConfirm={() => {
            void handleDelete();
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
