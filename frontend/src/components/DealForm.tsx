import { type FormEvent, useState } from "react";

import { type Deal, type DealInput, type Stage } from "../api/client";
import { formatUsd, parseUsdToCents } from "../lib/money";
import { STAGES, STAGE_META } from "../lib/pipeline";
import Field from "./Field";
import Modal from "./Modal";

interface DealFormProps {
  organizations: { id: number; name: string }[];
  contacts: { id: number; name: string }[];
  deal?: Deal;
  /** Preselected stage when a deal is added straight into a column. */
  initialStage?: Stage;
  onSubmit: (payload: DealInput) => Promise<void>;
  onCancel: () => void;
}

export default function DealForm({
  organizations,
  contacts,
  deal,
  initialStage,
  onSubmit,
  onCancel,
}: DealFormProps) {
  const startingStage = deal?.stage ?? initialStage ?? "New";
  const [name, setName] = useState(deal?.name ?? "");
  const [organizationId, setOrganizationId] = useState(
    deal ? String(deal.organization_id) : "",
  );
  const [contactId, setContactId] = useState(
    deal ? String(deal.contact_id) : "",
  );
  const [stage, setStage] = useState<Stage>(startingStage);
  const [probability, setProbability] = useState(
    String(deal?.probability ?? STAGE_META[startingStage].probability),
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
