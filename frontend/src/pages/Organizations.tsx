import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type Organization, type OrganizationInput } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable from "../components/DataTable";
import Field from "../components/Field";
import Modal from "../components/Modal";
import { cascadePreview } from "../lib/cascade";

export default function Organizations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: deals = [] } = useQuery({
    queryKey: ["deals"],
    queryFn: api.deals.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });

  const organizations = organizationsQuery.data ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);

  const columns: ColumnDef<Organization>[] = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "website",
      header: "Website",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
    {
      accessorKey: "industry",
      header: "Industry",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
  ];

  const refreshOrganization = () =>
    queryClient.invalidateQueries({ queryKey: ["organizations"] });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["contacts"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);
  };

  const handleCreate = async (payload: OrganizationInput) => {
    await api.organizations.create(payload);
    await refreshOrganization();
    setAdding(false);
  };

  const handleUpdate = async (payload: OrganizationInput) => {
    if (!editing) {
      return;
    }
    await api.organizations.update(editing.id, payload);
    await refreshOrganization();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.organizations.remove(deleting.id);
      await refreshAll();
      setDeleting(null);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <h1>Organizations</h1>
      <div className="panel">
        {organizationsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load organizations.
          </p>
        ) : organizationsQuery.isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <DataTable
            rows={organizations}
            columns={columns}
            searchFields={(row) => [
              row.name,
              row.website,
              row.industry,
              row.notes,
            ]}
            searchPlaceholder="Search organizations"
            addLabel="Add organization"
            onAdd={() => setAdding(true)}
            onEdit={setEditing}
            onDelete={setDeleting}
            onOpen={(row) => navigate(`/organizations/${row.id}`)}
          />
        )}
      </div>

      {adding ? (
        <OrganizationForm
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <OrganizationForm
          organization={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This cannot be undone."
          groups={cascadePreview("organization", deleting.id, {
            contacts,
            deals,
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

interface OrganizationFormProps {
  organization?: Organization;
  onSubmit: (payload: OrganizationInput) => Promise<void>;
  onCancel: () => void;
}

function OrganizationForm({
  organization,
  onSubmit,
  onCancel,
}: OrganizationFormProps) {
  const [name, setName] = useState(organization?.name ?? "");
  const [website, setWebsite] = useState(organization?.website ?? "");
  const [industry, setIndustry] = useState(organization?.industry ?? "");
  const [notes, setNotes] = useState(organization?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        website: website.trim() || null,
        industry: industry.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the organization.",
      );
    }
  };

  return (
    <Modal
      title={organization ? "Edit organization" : "Add organization"}
      onClose={onCancel}
    >
      <form className="record-form" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Website">
          <input
            value={website}
            placeholder="example.com"
            onChange={(event) => setWebsite(event.target.value)}
          />
        </Field>
        <Field label="Industry">
          <input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
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
          <button type="submit" className="btn btn-primary">
            {organization ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
