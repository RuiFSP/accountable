import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, logoDataUrl, type CompanySettings } from "../api/client";
import { formatDateTime } from "../lib/dates";
import {
  ACCENT_CONTRAST,
  EMAIL_INVALID,
  NAME_REQUIRED,
  TAX_RATE_RANGE,
} from "../lib/settings";
import Settings from "./Settings";

vi.mock("../api/client", () => ({
  api: {
    settings: {
      get: vi.fn(),
      save: vi.fn(),
      saveLogo: vi.fn(),
      removeLogo: vi.fn(),
    },
  },
  logoDataUrl: vi.fn(),
}));

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
  invoice_design: "classic",
  accent_color: "#073B4C",
  logo_content_type: null,
  updated_by: "priya@brightloop.example",
  updated_at: "2026-11-22T09:30:00+00:00",
};

const input = {
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "classic",
  accent_color: "#073B4C",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>,
  );
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function change(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^Save$|^Saving…$/ });
}

function meta(): HTMLElement {
  return screen.getByText(/^Last changed by /);
}

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.settings.get).mockResolvedValue(brightloop);
  vi.mocked(api.settings.save).mockImplementation(async (payload) => ({
    ...brightloop,
    ...payload,
    updated_by: "alex@brightloop.example",
    updated_at: "2026-11-23T12:00:00+00:00",
  }));
});

describe("Settings page", () => {
  it("shows a loading message while the row is pending", () => {
    vi.mocked(api.settings.get).mockImplementation(() => new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByLabelText("Company name")).toBeNull();
  });

  it("reports an error when the row fails to load", async () => {
    vi.mocked(api.settings.get).mockRejectedValue(new Error("boom"));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load settings.");
    expect(screen.queryByLabelText("Company name")).toBeNull();
  });

  it("shows Brightloop's values and the last-change line", async () => {
    renderPage();

    expect(await screen.findByLabelText("Company name")).toBeTruthy();
    expect(field("Company name").value).toBe("Brightloop");
    expect(field("Address").value).toBe(
      "1 Brightloop Plaza, Floor 12, New York, NY 10004",
    );
    expect(field("Email").value).toBe("hello@brightloop.example");
    expect(field("Phone").value).toBe("+1 555 0100");
    expect(field("Tax label").value).toBe("Sales tax");
    expect(field("Tax rate").value).toBe("8.875");
    expect(field("Payment terms (days)").value).toBe("30");
    expect(field("Quote prefix").value).toBe("QT-");
    expect(field("Invoice prefix").value).toBe("INV-");

    expect(meta().textContent).toContain("priya@brightloop.example");
    expect(meta().textContent).toContain(formatDateTime(brightloop.updated_at));
  });

  it("saves trimmed fields as the client's input", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    change("Company name", "  Brightloop Studio ");
    change("Address", "  9 Market Street ");
    change("Email", " hello@brightloop.example ");
    change("Phone", " +1 555 0199 ");
    change("Tax label", " VAT ");
    change("Quote prefix", " QT-2 ");
    change("Invoice prefix", " INV-2 ");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(api.settings.save).toHaveBeenCalledWith({
        ...input,
        name: "Brightloop Studio",
        address: "9 Market Street",
        email: "hello@brightloop.example",
        phone: "+1 555 0199",
        tax_label: "VAT",
        quote_prefix: "QT-2",
        invoice_prefix: "INV-2",
      }),
    );
  });

  it("repopulates the form from the saved reply and updates the line", async () => {
    vi.mocked(api.settings.save).mockResolvedValue({
      ...brightloop,
      name: "Brightloop Studio",
      updated_by: "alex@brightloop.example",
      updated_at: "2026-11-23T12:00:00+00:00",
    });
    renderPage();
    await screen.findByLabelText("Company name");

    change("Company name", "brightloop studio");
    fireEvent.click(saveButton());

    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(field("Company name").value).toBe("Brightloop Studio");
    expect(meta().textContent).toContain("alex@brightloop.example");
    expect(meta().textContent).toContain(
      formatDateTime("2026-11-23T12:00:00+00:00"),
    );
  });

  it("shows the stored values after a save that changes nothing", async () => {
    const stored: CompanySettings = {
      ...brightloop,
      tax_rate_thousandths: 0,
      payment_terms_days: 0,
      quote_prefix: null,
    };
    vi.mocked(api.settings.get).mockResolvedValue(stored);
    vi.mocked(api.settings.save).mockResolvedValue(stored);
    renderPage();
    await screen.findByLabelText("Company name");

    change("Tax rate", "   ");
    change("Payment terms (days)", "");
    change("Quote prefix", " ");
    fireEvent.click(saveButton());

    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(field("Tax rate").value).toBe("0");
    expect(field("Payment terms (days)").value).toBe("0");
    expect(field("Quote prefix").value).toBe("");
    expect(meta().textContent).toContain("priya@brightloop.example");
    expect(api.settings.save).toHaveBeenCalledWith({
      ...input,
      tax_rate_thousandths: 0,
      payment_terms_days: 0,
      quote_prefix: null,
    });
  });

  it("saves a blank rate and blank terms as 0 and blank text as null", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    change("Address", "   ");
    change("Email", "");
    change("Phone", " ");
    change("Tax label", "");
    change("Tax rate", "");
    change("Payment terms (days)", "");
    change("Quote prefix", "");
    change("Invoice prefix", "  ");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(api.settings.save).toHaveBeenCalledWith({
        ...input,
        address: null,
        email: null,
        phone: null,
        tax_label: null,
        tax_rate_thousandths: 0,
        payment_terms_days: 0,
        quote_prefix: null,
        invoice_prefix: null,
      }),
    );
  });

  it("shows the server's message when the API refuses a save", async () => {
    vi.mocked(api.settings.save).mockRejectedValue(
      new Error("The tax rate must be between 0 and 100."),
    );
    renderPage();
    await screen.findByLabelText("Company name");

    change("Tax label", "VAT");
    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(TAX_RATE_RANGE);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stops a save that breaks a rule on the page", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    change("Company name", "   ");
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toBe(NAME_REQUIRED);

    change("Company name", "Brightloop");
    change("Email", "not-an-email");
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toBe(EMAIL_INVALID);

    expect(api.settings.save).not.toHaveBeenCalled();
  });

  it("shows the saving state until the reply arrives", async () => {
    let finish: (reply: CompanySettings) => void = () => {};
    vi.mocked(api.settings.save).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    await screen.findByLabelText("Company name");

    fireEvent.click(saveButton());

    const saving = (await screen.findByRole("button", {
      name: "Saving…",
    })) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);

    finish({
      ...brightloop,
      name: "Brightloop Studio",
      updated_at: "2026-11-23T12:00:00+00:00",
    });

    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("clears the saved line as soon as a field is edited", async () => {
    renderPage();
    await screen.findByLabelText("Company name");
    fireEvent.click(saveButton());
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");

    change("Phone", "+1 555 0111");

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the Documents section", () => {
  function documentsButton(): HTMLButtonElement {
    return screen.getByRole("button", { name: /^Save documents$/ });
  }

  it("saves the design and the accent apart from the company details", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    fireEvent.change(screen.getByLabelText("Design"), {
      target: { value: "modern" },
    });
    fireEvent.click(documentsButton());

    await waitFor(() =>
      expect(api.settings.save).toHaveBeenCalledWith({
        ...input,
        invoice_design: "modern",
      }),
    );
    expect(api.settings.save).toHaveBeenCalledTimes(1);
    // Both forms show one saved line and one last-change line.
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(meta().textContent).toContain("alex@brightloop.example");
    expect(meta().textContent).toContain(
      formatDateTime("2026-11-23T12:00:00+00:00"),
    );
    expect(field("Company name").value).toBe("Brightloop");
  });

  it("moves the last-change line when the company details save", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    change("Phone", "+1 555 0177");
    fireEvent.click(saveButton());

    await waitFor(() => expect(api.settings.save).toHaveBeenCalled());
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(meta().textContent).toContain("alex@brightloop.example");
  });

  it("follows the design and the accent as they are chosen on the sample", async () => {
    renderPage();
    const sheet = await screen.findByLabelText("Invoice document");
    expect(sheet.classList.contains("sheet-classic")).toBe(true);
    expect(sheet.style.getPropertyValue("--sheet-accent").trim()).toBe(
      "#073B4C",
    );

    fireEvent.change(screen.getByLabelText("Design"), {
      target: { value: "modern" },
    });
    expect(sheet.classList.contains("sheet-modern")).toBe(true);

    fireEvent.change(screen.getByLabelText("Accent color"), {
      target: { value: "#000000" },
    });
    expect(sheet.style.getPropertyValue("--sheet-accent").trim()).toBe(
      "#000000",
    );
  });

  it("refuses an accent that is too light to read on white", async () => {
    renderPage();
    await screen.findByLabelText("Company name");

    fireEvent.change(screen.getByLabelText("Accent color"), {
      target: { value: "#118AB2" },
    });
    fireEvent.click(documentsButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(ACCENT_CONTRAST);
    expect(api.settings.save).not.toHaveBeenCalled();
  });

  it("uploads the logo and removes it", async () => {
    vi.mocked(logoDataUrl).mockResolvedValue(null);
    vi.mocked(api.settings.saveLogo).mockResolvedValue({
      ...brightloop,
      logo_content_type: "image/png",
    });
    vi.mocked(api.settings.removeLogo).mockResolvedValue({
      ...brightloop,
      logo_content_type: null,
    });
    renderPage();
    await screen.findByLabelText("Company name");
    expect(screen.queryByRole("img", { name: "Logo" })).toBeNull();

    const file = new File(["a png"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Logo"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(api.settings.saveLogo).toHaveBeenCalledWith({
        content_type: "image/png",
        data: expect.any(String),
      }),
    );
    expect(await screen.findByRole("img", { name: "Logo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));

    await waitFor(() =>
      expect(api.settings.removeLogo).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByRole("img", { name: "Logo" })).toBeNull();
  });
});
