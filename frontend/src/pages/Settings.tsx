import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api, type CompanySettings } from "../api/client";
import Field from "../components/Field";
import { formatDateTime } from "../lib/dates";
import {
  initialSettingsForm,
  settingsInput,
  type SettingsForm as SettingsFormValues,
} from "../lib/settings";

export default function Settings() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <h1>Settings</h1>
      <div className="panel settings-panel">
        {settingsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load settings.
          </p>
        ) : settingsQuery.data === undefined ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="settings-meta">
              Last changed by {settingsQuery.data.updated_by ?? "—"} on{" "}
              {formatDateTime(settingsQuery.data.updated_at)}
            </p>
            <SettingsForm
              key={settingsQuery.data.updated_at}
              settings={settingsQuery.data}
              saved={saved}
              onSaved={() => setSaved(true)}
              onEdit={() => setSaved(false)}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface SettingsFormProps {
  settings: CompanySettings;
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
}

function SettingsForm({ settings, saved, onSaved, onEdit }: SettingsFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => initialSettingsForm(settings));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof SettingsFormValues>(
    field: K,
    value: SettingsFormValues[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    onEdit();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = settingsInput(form);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const reply = await api.settings.save(result.input);
      queryClient.setQueryData(["settings"], reply);
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="record-form" noValidate onSubmit={handleSubmit}>
      <Field label="Company name">
        <input
          autoComplete="organization"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>
      <Field label="Address">
        <textarea
          rows={3}
          value={form.address}
          onChange={(event) => update("address", event.target.value)}
        />
      </Field>
      <div className="form-row">
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Tax label">
          <input
            placeholder="Sales tax"
            value={form.taxLabel}
            onChange={(event) => update("taxLabel", event.target.value)}
          />
        </Field>
        <Field
          label="Tax rate"
          hint="A percentage from 0 to 100, for example 8.875."
        >
          <input
            inputMode="decimal"
            value={form.taxRate}
            onChange={(event) => update("taxRate", event.target.value)}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field
          label="Payment terms (days)"
          hint="A whole number of days from 0 to 365."
        >
          <input
            inputMode="numeric"
            value={form.paymentTerms}
            onChange={(event) => update("paymentTerms", event.target.value)}
          />
        </Field>
        <Field label="Quote prefix" hint="Up to 10 letters, digits or hyphens.">
          <input
            value={form.quotePrefix}
            onChange={(event) => update("quotePrefix", event.target.value)}
          />
        </Field>
        <Field
          label="Invoice prefix"
          hint="Up to 10 letters, digits or hyphens."
        >
          <input
            value={form.invoicePrefix}
            onChange={(event) => update("invoicePrefix", event.target.value)}
          />
        </Field>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <p className="muted" role="status">
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}
