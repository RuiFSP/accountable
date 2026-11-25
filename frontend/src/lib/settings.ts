/** Company settings: the shared rules, and the tax rate as exact thousandths. */

import type { CompanySettings, CompanySettingsInput } from "../api/client";

export interface SettingsForm {
  name: string;
  address: string;
  email: string;
  phone: string;
  taxLabel: string;
  taxRate: string;
  paymentTerms: string;
  quotePrefix: string;
  invoicePrefix: string;
}

export type SettingsInputResult =
  { input: CompanySettingsInput } | { error: string };

export const NAME_REQUIRED = "The company name is required.";
export const EMAIL_INVALID = "The email must look like an email.";
export const TAX_RATE_RANGE = "The tax rate must be between 0 and 100.";
export const PAYMENT_TERMS_RANGE =
  "Payment terms must be a whole number of days from 0 to 365.";
export const PREFIX_INVALID =
  "A prefix can be at most 10 characters of letters, digits and hyphens.";

const MAX_TAX_RATE_THOUSANDTHS = 100_000;
const MAX_PAYMENT_TERMS_DAYS = 365;
const MAX_PREFIX_LENGTH = 10;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PREFIX_PATTERN = /^[A-Za-z0-9-]+$/;
const TAX_RATE_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;
const WHOLE_DAYS_PATTERN = /^\d+$/;

/** 8875 as "8.875", 100 as "0.1", 100000 as "100"; no float maths. */
export function formatTaxRate(thousandths: number): string {
  const whole = Math.trunc(thousandths / 1000);
  const fraction = thousandths % 1000;
  if (fraction === 0) {
    return String(whole);
  }
  const places = String(fraction).padStart(3, "0").replace(/0+$/, "");
  return `${whole}.${places}`;
}

/** A typed rate as thousandths; blank is 0, anything outside 0–100 is null. */
export function parseTaxRateToThousandths(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  const match = TAX_RATE_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, whole, fraction = ""] = match;
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return thousandths <= MAX_TAX_RATE_THOUSANDTHS ? thousandths : null;
}

export function initialSettingsForm(settings: CompanySettings): SettingsForm {
  return {
    name: settings.name,
    address: settings.address ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    taxLabel: settings.tax_label ?? "",
    taxRate: formatTaxRate(settings.tax_rate_thousandths),
    paymentTerms: String(settings.payment_terms_days),
    quotePrefix: settings.quote_prefix ?? "",
    invoicePrefix: settings.invoice_prefix ?? "",
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parsePaymentTerms(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  if (!WHOLE_DAYS_PATTERN.test(trimmed)) {
    return null;
  }
  const days = Number(trimmed);
  return days <= MAX_PAYMENT_TERMS_DAYS ? days : null;
}

function isPrefix(value: string | null): boolean {
  return (
    value === null ||
    (value.length <= MAX_PREFIX_LENGTH && PREFIX_PATTERN.test(value))
  );
}

/** The form as the API's input, or the first rule it breaks. */
export function settingsInput(form: SettingsForm): SettingsInputResult {
  const name = form.name.trim();
  if (name === "") {
    return { error: NAME_REQUIRED };
  }
  const email = optionalText(form.email);
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    return { error: EMAIL_INVALID };
  }
  const taxRate = parseTaxRateToThousandths(form.taxRate);
  if (taxRate === null) {
    return { error: TAX_RATE_RANGE };
  }
  const paymentTerms = parsePaymentTerms(form.paymentTerms);
  if (paymentTerms === null) {
    return { error: PAYMENT_TERMS_RANGE };
  }
  const quotePrefix = optionalText(form.quotePrefix);
  const invoicePrefix = optionalText(form.invoicePrefix);
  if (!isPrefix(quotePrefix) || !isPrefix(invoicePrefix)) {
    return { error: PREFIX_INVALID };
  }
  return {
    input: {
      name,
      address: optionalText(form.address),
      email,
      phone: optionalText(form.phone),
      tax_label: optionalText(form.taxLabel),
      tax_rate_thousandths: taxRate,
      payment_terms_days: paymentTerms,
      quote_prefix: quotePrefix,
      invoice_prefix: invoicePrefix,
    },
  };
}
