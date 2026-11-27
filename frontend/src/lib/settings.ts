/** Company settings: the shared rules, and the tax rate as exact thousandths. */

import type {
  CompanySettings,
  CompanySettingsInput,
  InvoiceDesign,
} from "../api/client";

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
  invoiceDesign: InvoiceDesign;
  accentColor: string;
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
export const DESIGN_INVALID =
  "The invoice design is Classic, Modern or Compact.";
export const ACCENT_INVALID =
  "The accent is a hex color: # followed by six digits.";
export const ACCENT_CONTRAST =
  "The accent is too light to read on white. Choose a darker color.";

const MAX_TAX_RATE_THOUSANDTHS = 100_000;
const MAX_PAYMENT_TERMS_DAYS = 365;
const MAX_PREFIX_LENGTH = 10;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PREFIX_PATTERN = /^[A-Za-z0-9-]+$/;
const TAX_RATE_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;
const WHOLE_DAYS_PATTERN = /^\d+$/;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const INVOICE_DESIGNS: InvoiceDesign[] = ["classic", "modern", "compact"];

/**
 * Whether text drawn in this accent stays readable on white paper: 4.5:1 or
 * better. The backend's app/documents.py does the same, and both sides run
 * the accents in shared/invoice-cases.json.
 */
export function accentIsReadable(hexColor: string): boolean {
  return contrastVsWhite(hexColor) >= 4.5;
}

function contrastVsWhite(hexColor: string): number {
  return 1.05 / (relativeLuminance(hexColor) + 0.05);
}

function relativeLuminance(hexColor: string): number {
  const channel = (light: number): number => {
    const shade = light / 255;
    return shade <= 0.04045
      ? shade / 12.92
      : Math.pow((shade + 0.055) / 1.055, 2.4);
  };
  const red = channel(parseInt(hexColor.slice(1, 3), 16));
  const green = channel(parseInt(hexColor.slice(3, 5), 16));
  const blue = channel(parseInt(hexColor.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

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
    invoiceDesign: settings.invoice_design,
    accentColor: settings.accent_color,
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
  if (!INVOICE_DESIGNS.includes(form.invoiceDesign)) {
    return { error: DESIGN_INVALID };
  }
  if (!HEX_PATTERN.test(form.accentColor)) {
    return { error: ACCENT_INVALID };
  }
  if (!accentIsReadable(form.accentColor)) {
    return { error: ACCENT_CONTRAST };
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
      invoice_design: form.invoiceDesign,
      accent_color: form.accentColor,
    },
  };
}
