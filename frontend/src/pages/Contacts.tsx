import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type Contact, type ContactInput } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import ContactForm from "../components/ContactForm";
import DataTable from "../components/DataTable";
import { cascadePreview } from "../lib/cascade";
import { CONTACT_STATUSES } from "../lib/pipeline";
import { capitalize } from "../lib/text";

export default function Contacts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });

  const contacts = contactsQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  // The Organization cells read from the organizations list, and TanStack
  // caches a cell's value on its row's first render — a row built while the
  // list was still loading would keep "—" for good, so the table waits.
  const tableLoading = contactsQuery.isLoading || organizationsQuery.isLoading;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const organizationName = (organizationId: number | null): string =>
    organizations.find((organization) => organization.id === organizationId)
      ?.name ?? "—";

  const columns: ColumnDef<Contact>[] = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "email",
      header: "Email",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
    {
      accessorKey: "job_title",
      header: "Job title",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
    {
      id: "organization",
      accessorFn: (row) => organizationName(row.organization_id),
      header: "Organization",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => (
        <span className={`badge badge-${info.getValue() as string}`}>
          {capitalize(info.getValue() as string)}
        </span>
      ),
    },
  ];

  const refreshContacts = () =>
    queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const refreshAfterDelete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["contacts"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);
  };

  const handleCreate = async (payload: ContactInput) => {
    await api.contacts.create(payload);
    await refreshContacts();
    setAdding(false);
  };

  const handleUpdate = async (payload: ContactInput) => {
    if (!editing) {
      return;
    }
    await api.contacts.update(editing.id, payload);
    await refreshContacts();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.contacts.remove(deleting.id);
      await refreshAfterDelete();
      setDeleting(null);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <h1>Contacts</h1>
      <div className="panel">
        {contactsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load contacts.
          </p>
        ) : tableLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <DataTable
            rows={contacts}
            columns={columns}
            searchFields={(row) => [
              row.name,
              row.email,
              row.job_title,
              organizationName(row.organization_id),
            ]}
            searchPlaceholder="Search contacts"
            addLabel="Add contact"
            filter={{
              columnId: "status",
              label: "Status",
              options: CONTACT_STATUSES.map((status) => ({
                value: status,
                label: capitalize(status),
              })),
            }}
            onAdd={() => setAdding(true)}
            onEdit={setEditing}
            onDelete={setDeleting}
            onOpen={(row) => navigate(`/contacts/${row.id}`)}
          />
        )}
      </div>

      {adding ? (
        <ContactForm
          organizations={organizations}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <ContactForm
          organizations={organizations}
          contact={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This cannot be undone."
          groups={cascadePreview("contact", deleting.id, {
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
