import { FormEvent, useState } from "react";

import {
  type Contact,
  type ContactInput,
  type ContactStatus,
} from "../api/client";
import { CONTACT_STATUSES } from "../lib/pipeline";
import { capitalize } from "../lib/text";
import Field from "./Field";
import Modal from "./Modal";

interface ContactFormProps {
  organizations: { id: number; name: string }[];
  contact?: Contact;
  onSubmit: (payload: ContactInput) => Promise<void>;
  onCancel: () => void;
}

function initialFormState(contact: Contact | undefined) {
  return {
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    jobTitle: contact?.job_title ?? "",
    organizationId: contact?.organization_id
      ? String(contact.organization_id)
      : "",
    status: contact?.status ?? "lead",
  };
}

export default function ContactForm({
  organizations,
  contact,
  onSubmit,
  onCancel,
}: ContactFormProps) {
  const initial = initialFormState(contact);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [jobTitle, setJobTitle] = useState(initial.jobTitle);
  const [organizationId, setOrganizationId] = useState(initial.organizationId);
  const [status, setStatus] = useState<ContactStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
        organization_id: organizationId ? Number(organizationId) : null,
        status,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the contact.",
      );
    }
  };

  return (
    <Modal title={contact ? "Edit contact" : "Add contact"} onClose={onCancel}>
      <form className="record-form" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Job title">
          <input
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label="Organization">
            <select
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">None</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ContactStatus)
              }
            >
              {CONTACT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {capitalize(option)}
                </option>
              ))}
            </select>
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
            {contact ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
