import { FormEvent, useState } from "react";

import { type Organization, type OrganizationInput } from "../api/client";
import Field from "./Field";
import Modal from "./Modal";

interface OrganizationFormProps {
  organization?: Organization;
  onSubmit: (payload: OrganizationInput) => Promise<void>;
  onCancel: () => void;
}

export default function OrganizationForm({
  organization,
  onSubmit,
  onCancel,
}: OrganizationFormProps) {
  const [name, setName] = useState(organization?.name ?? "");
  const [website, setWebsite] = useState(organization?.website ?? "");
  const [industry, setIndustry] = useState(organization?.industry ?? "");
  const [notes, setNotes] = useState(organization?.notes ?? "");
  const [billingAddress, setBillingAddress] = useState(
    organization?.billing_address ?? "",
  );
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
        billing_address: billingAddress.trim() || null,
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
        <Field
          label="Billing address"
          hint="One block of text, used on the organization's invoices."
        >
          <textarea
            rows={3}
            value={billingAddress}
            onChange={(event) => setBillingAddress(event.target.value)}
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
