import { describe, expect, it } from "vitest";

import type { CompanySettings } from "../api/client";
import {
  EMAIL_INVALID,
  formatTaxRate,
  initialSettingsForm,
  NAME_REQUIRED,
  PAYMENT_TERMS_RANGE,
  PREFIX_INVALID,
  parseTaxRateToThousandths,
  settingsInput,
  TAX_RATE_RANGE,
  type SettingsForm,
} from "./settings";

const brightloop: CompanySettings = {
  id: 1,
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  updated_by: "priya@brightloop.example",
  updated_at: "2026-11-22T09:30:00+00:00",
};

function formWith(overrides: Partial<SettingsForm> = {}): SettingsForm {
  return { ...initialSettingsForm(brightloop), ...overrides };
}

function inputOf(form: SettingsForm) {
  const result = settingsInput(form);
  if ("error" in result) {
    throw new Error(`Expected input, got the error ${result.error}`);
  }
  return result.input;
}

function errorOf(form: SettingsForm): string {
  const result = settingsInput(form);
  if ("input" in result) {
    throw new Error("Expected an error, got an input");
  }
  return result.error;
}

describe("formatTaxRate", () => {
  it("writes the stored thousandths without float rounding", () => {
    expect(formatTaxRate(0)).toBe("0");
    expect(formatTaxRate(1)).toBe("0.001");
    expect(formatTaxRate(100)).toBe("0.1");
    expect(formatTaxRate(110)).toBe("0.11");
    expect(formatTaxRate(8875)).toBe("8.875");
    expect(formatTaxRate(100000)).toBe("100");
  });
});

describe("parseTaxRateToThousandths", () => {
  it("parses whole and fractional rates with integer arithmetic", () => {
    expect(parseTaxRateToThousandths("0")).toBe(0);
    expect(parseTaxRateToThousandths("8.875")).toBe(8875);
    expect(parseTaxRateToThousandths("8.8")).toBe(8800);
    expect(parseTaxRateToThousandths("0.001")).toBe(1);
    expect(parseTaxRateToThousandths("100")).toBe(100_000);
  });

  it("treats a blank rate as 0", () => {
    expect(parseTaxRateToThousandths("")).toBe(0);
    expect(parseTaxRateToThousandths("   ")).toBe(0);
  });

  it("refuses a sign, a percent sign, too many decimals, text and out-of-range values", () => {
    for (const text of [
      "%",
      "8.875%",
      "8.8755",
      "-1",
      "+1",
      "100.001",
      "150",
      "eight",
      "8,875",
    ]) {
      expect(parseTaxRateToThousandths(text), text).toBeNull();
    }
  });
});

describe("initialSettingsForm", () => {
  it("turns the row into the text fields the form edits", () => {
    expect(initialSettingsForm(brightloop)).toEqual({
      name: "Brightloop",
      address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
      email: "hello@brightloop.example",
      phone: "+1 555 0100",
      taxLabel: "Sales tax",
      taxRate: "8.875",
      paymentTerms: "30",
      quotePrefix: "QT-",
      invoicePrefix: "INV-",
    });
  });

  it("shows blanks for the optional values that are null", () => {
    const sparse = initialSettingsForm({
      ...brightloop,
      address: null,
      email: null,
      phone: null,
      tax_label: null,
      quote_prefix: null,
      invoice_prefix: null,
    });

    expect(sparse.address).toBe("");
    expect(sparse.email).toBe("");
    expect(sparse.phone).toBe("");
    expect(sparse.taxLabel).toBe("");
    expect(sparse.quotePrefix).toBe("");
    expect(sparse.invoicePrefix).toBe("");
  });
});

describe("settingsInput", () => {
  it("trims every text field", () => {
    const input = inputOf(
      formWith({
        name: "  Brightloop Studio ",
        address: "  9 Market Street ",
        email: " hello@brightloop.example ",
        phone: " +1 555 0199 ",
        taxLabel: " VAT ",
        quotePrefix: " QT-2 ",
        invoicePrefix: " INV-2 ",
      }),
    );

    expect(input).toEqual({
      name: "Brightloop Studio",
      address: "9 Market Street",
      email: "hello@brightloop.example",
      phone: "+1 555 0199",
      tax_label: "VAT",
      tax_rate_thousandths: 8875,
      payment_terms_days: 30,
      quote_prefix: "QT-2",
      invoice_prefix: "INV-2",
    });
  });

  it("turns blank optional text into null and a blank rate and terms into 0", () => {
    const input = inputOf(
      formWith({
        address: "   ",
        email: "",
        phone: " ",
        taxLabel: "",
        taxRate: " ",
        paymentTerms: "",
        quotePrefix: "",
        invoicePrefix: "   ",
      }),
    );

    expect(input.address).toBeNull();
    expect(input.email).toBeNull();
    expect(input.phone).toBeNull();
    expect(input.tax_label).toBeNull();
    expect(input.quote_prefix).toBeNull();
    expect(input.invoice_prefix).toBeNull();
    expect(input.tax_rate_thousandths).toBe(0);
    expect(input.payment_terms_days).toBe(0);
  });

  it("accepts every boundary", () => {
    const input = inputOf(
      formWith({
        taxRate: "100",
        paymentTerms: "365",
        quotePrefix: "ABCDEFGHIJ",
        invoicePrefix: "0123456789",
      }),
    );

    expect(input.tax_rate_thousandths).toBe(100_000);
    expect(input.payment_terms_days).toBe(365);
    expect(input.quote_prefix).toBe("ABCDEFGHIJ");
    expect(input.invoice_prefix).toBe("0123456789");
  });

  it("refuses a blank name", () => {
    expect(errorOf(formWith({ name: "   " }))).toBe(NAME_REQUIRED);
  });

  it("refuses an email that does not look like one", () => {
    for (const email of [
      "not-an-email",
      "two@@brightloop.example",
      "no-dot@brightloop",
    ]) {
      expect(errorOf(formWith({ email })), email).toBe(EMAIL_INVALID);
    }
  });

  it("refuses a tax rate outside 0 to 100, or in the wrong shape", () => {
    for (const taxRate of ["150", "-1", "100.001", "8.8755", "%", "eight"]) {
      expect(errorOf(formWith({ taxRate })), taxRate).toBe(TAX_RATE_RANGE);
    }
  });

  it("refuses payment terms outside 0 to 365 days", () => {
    for (const paymentTerms of ["400", "-1", "366", "1.5", "many"]) {
      expect(errorOf(formWith({ paymentTerms })), paymentTerms).toBe(
        PAYMENT_TERMS_RANGE,
      );
    }
  });

  it("refuses a prefix over 10 characters or outside letters, digits and hyphens", () => {
    for (const quotePrefix of ["ABCDEFGHIJK", "QT 1", "QT_1"]) {
      expect(errorOf(formWith({ quotePrefix })), quotePrefix).toBe(
        PREFIX_INVALID,
      );
    }
    expect(errorOf(formWith({ invoicePrefix: "INV/1" }))).toBe(PREFIX_INVALID);
  });

  it("returns the first rule broken, in the order the fields are checked", () => {
    expect(
      errorOf(
        formWith({
          name: " ",
          email: "bad",
          taxRate: "150",
          paymentTerms: "400",
        }),
      ),
    ).toBe(NAME_REQUIRED);
    expect(
      errorOf(formWith({ email: "bad", taxRate: "150", paymentTerms: "400" })),
    ).toBe(EMAIL_INVALID);
    expect(errorOf(formWith({ taxRate: "150", paymentTerms: "400" }))).toBe(
      TAX_RATE_RANGE,
    );
    expect(errorOf(formWith({ paymentTerms: "400", quotePrefix: "!" }))).toBe(
      PAYMENT_TERMS_RANGE,
    );
  });
});
