import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type Deal, type DealInput, type Stage } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable from "../components/DataTable";
import Field from "../components/Field";
import Modal from "../components/Modal";
import { cascadePreview } from "../lib/cascade";
import { formatDate } from "../lib/dates";
import { formatUsd, parseUsdToCents } from "../lib/money";
import { STAGES, STAGE_META } from "../lib/pipeline";

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
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);

  const organizationName = (organizationId: number): string =>
    organizations.find((organization) => organization.id === organizationId)
      ?.name ?? "—";
  const contactName = (contactId: number): string =>
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
    setAdding(false);
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
          onCancel={() => setAdding(false)}
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

interface DealFormProps {
  organizations: { id: number; name: string }[];
  contacts: { id: number; name: string }[];
  deal?: Deal;
  onSubmit: (payload: DealInput) => Promise<void>;
  onCancel: () => void;
}

function DealForm({
  organizations,
  contacts,
  deal,
  onSubmit,
  onCancel,
}: DealFormProps) {
  const [name, setName] = useState(deal?.name ?? "");
  const [organizationId, setOrganizationId] = useState(
    deal ? String(deal.organization_id) : "",
  );
  const [contactId, setContactId] = useState(
    deal ? String(deal.contact_id) : "",
  );
  const [stage, setStage] = useState<Stage>(deal?.stage ?? "New");
  const [probability, setProbability] = useState(
    String(deal?.probability ?? STAGE_META.New.probability),
  );
  const [valueText, setValueText] = useState(
    deal ? formatUsd(deal.value_cents) : "",
  );
  const [closeDate, setCloseDate] = useState(deal?.close_date ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleStageChange = (nextStage: Stage) => {
    setStage(nextStage);
    setProbability(String(STAGE_META[nextStage].probability));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const valueCents = parseUsdToCents(valueText);
    if (valueCents === null) {
      setError("Enter an amount in US dollars, for example 12,500.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        organization_id: Number(organizationId),
        contact_id: Number(contactId),
        stage,
        value_cents: valueCents,
        probability: Number(probability),
        close_date: closeDate,
        position: deal?.position ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the deal.");
    }
  };

  return (
    <Modal title={deal ? "Edit deal" : "Add deal"} onClose={onCancel}>
      <form className="record-form" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label="Organization">
            <select
              required
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">Choose…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact">
            <select
              required
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">Choose…</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Stage">
            <select
              value={stage}
              onChange={(event) =>
                handleStageChange(event.target.value as Stage)
              }
            >
              {STAGES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Probability (%)" hint="Kept until the stage changes.">
            <input
              type="number"
              min={0}
              max={100}
              required
              value={probability}
              onChange={(event) => setProbability(event.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Value (USD)">
            <input
              required
              inputMode="decimal"
              placeholder="12,500"
              value={valueText}
              onChange={(event) => setValueText(event.target.value)}
            />
          </Field>
          <Field label="Close date">
            <input
              type="date"
              required
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
            />
          </Field>
        </div>
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
            {deal ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
