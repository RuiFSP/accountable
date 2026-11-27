import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useState } from "react";

import {
  api,
  logoDataUrl,
  type CompanySettings,
  type InvoiceDesign,
  type LogoInput,
} from "../api/client";
import Field from "../components/Field";
import InvoicePreview, {
  type InvoiceSheet,
} from "../components/InvoicePreview";
import { formatDateTime } from "../lib/dates";
import { totals } from "../lib/tax";
import {
  initialSettingsForm,
  settingsInput,
  type SettingsForm as SettingsFormValues,
} from "../lib/settings";

const DESIGNS: { value: InvoiceDesign; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "compact", label: "Compact" },
];

const LOGO_TOO_BIG = "The logo must be a file of 1 MB or less.";
const LOGO_MISSING = "Could not save the logo.";

/** The sample document beside the Documents form: two lines of a real invoice. */
function sampleSheet(settings: CompanySettings): InvoiceSheet {
  const lines = [
    { description: "Website redesign", quantity: 1, unit_price_cents: 850_000 },
    { description: "Support retainer", quantity: 2, unit_price_cents: 175_000 },
  ];
  const sums = totals(lines, settings.tax_rate_thousandths);
  return {
    number: "INV-0042",
    issue_date: "2026-11-22",
    due_date: "2026-12-22",
    status: "issued",
    bill_to_name: "Northwind Traders",
    bill_to_address: "500 Market Street\nSan Francisco, CA 94105",
    bill_to_contact_name: "Ana Silva",
    bill_to_contact_email: "ana@northwind.example",
    lines,
    subtotal_cents: sums.subtotal_cents,
    tax_label: settings.tax_label,
    tax_rate_thousandths: settings.tax_rate_thousandths,
    tax_cents: sums.tax_cents,
    total_cents: sums.total_cents,
  };
}

export default function Settings() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });
  const [companySaved, setCompanySaved] = useState(false);
  const [documentsSaved, setDocumentsSaved] = useState(false);

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
            {/* Both forms save from the same stored row, so a save refreshes
                them together with the reply's values. */}
            <div key={settingsQuery.data.updated_at}>
              <SettingsForm
                settings={settingsQuery.data}
                saved={companySaved}
                onSaved={() => setCompanySaved(true)}
                onEdit={() => setCompanySaved(false)}
              />
            </div>
          </>
        )}
      </div>

      {settingsQuery.data === undefined ? null : (
        <div
          className="panel settings-panel"
          key={`documents-${settingsQuery.data.updated_at}`}
        >
          <h2>Documents</h2>
          <DocumentsForm
            settings={settingsQuery.data}
            saved={documentsSaved}
            onSaved={() => setDocumentsSaved(true)}
            onEdit={() => setDocumentsSaved(false)}
          />
        </div>
      )}
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
      // The reply is what the server stored, also when it stored nothing:
      // show that, not what was typed.
      setForm(initialSettingsForm(reply));
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

interface DocumentsFormProps {
  settings: CompanySettings;
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
}

/**
 * The Documents section: the design and the accent with the sample invoice
 * that follows them, and the logo, each saved through its own button.
 */
function DocumentsForm({
  settings,
  saved,
  onSaved,
  onEdit,
}: DocumentsFormProps) {
  const queryClient = useQueryClient();
  const [design, setDesign] = useState<InvoiceDesign>(settings.invoice_design);
  const [accent, setAccent] = useState(settings.accent_color);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const logoQuery = useQuery({
    queryKey: ["logo"],
    queryFn: logoDataUrl,
    staleTime: Infinity,
  });

  const sample: InvoiceSheet = sampleSheet(settings);
  const sampleSettings: CompanySettings = {
    ...settings,
    invoice_design: design,
    accent_color: accent,
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = settingsInput({
      ...initialSettingsForm(settings),
      invoiceDesign: design,
      accentColor: accent,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const reply = await api.settings.save(result.input);
      queryClient.setQueryData(["settings"], reply);
      setDesign(reply.invoice_design);
      setAccent(reply.accent_color);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (file.size > 1_000_000) {
      setLogoError(LOGO_TOO_BIG);
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      const semicolon = url.indexOf(";");
      const comma = url.indexOf(",");
      const payload: LogoInput = {
        content_type: url.slice(5, semicolon),
        data: url.slice(comma + 1),
      };
      const reply = await api.settings.saveLogo(payload);
      queryClient.setQueryData(["settings"], reply);
      queryClient.setQueryData(["logo"], url);
      setLogoError(null);
      onSaved();
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : LOGO_MISSING);
    }
  }

  async function removeLogo() {
    try {
      const reply = await api.settings.removeLogo();
      queryClient.setQueryData(["settings"], reply);
      queryClient.setQueryData(["logo"], null);
      setLogoError(null);
      onSaved();
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : LOGO_MISSING);
    }
  }

  return (
    <div className="document-editor">
      <form className="record-form" noValidate onSubmit={handleSubmit}>
        <Field label="Design">
          <select
            value={design}
            onChange={(event) => {
              setDesign(event.target.value as InvoiceDesign);
              onEdit();
            }}
          >
            {DESIGNS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Accent color"
          hint="A hex color such as a six-digit code, dark enough to read on white."
        >
          <input
            value={accent}
            onChange={(event) => {
              setAccent(event.target.value);
              onEdit();
            }}
          />
        </Field>
        <Field label="Logo" hint="PNG or JPEG, up to 1 MB.">
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadLogo(file);
              }
              event.target.value = "";
            }}
          />
        </Field>
        {logoQuery.data ? (
          <p className="muted">
            <img className="settings-logo" src={logoQuery.data} alt="Logo" />
            <button
              type="button"
              className="btn"
              onClick={() => void removeLogo()}
            >
              Remove logo
            </button>
          </p>
        ) : null}
        {logoError ? (
          <p className="form-error" role="alert">
            {logoError}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save documents"}
          </button>
          {saved ? (
            <p className="muted" role="status">
              Saved.
            </p>
          ) : null}
        </div>
      </form>
      <div>
        <p className="settings-meta">The sample updates as you choose.</p>
        <InvoicePreview
          invoice={sample}
          settings={sampleSettings}
          logo={logoQuery.data ?? null}
        />
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(LOGO_MISSING));
    reader.readAsDataURL(file);
  });
}
