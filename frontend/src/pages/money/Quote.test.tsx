import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type CompanySettings, type Product } from "../../api/client";
import type { QuoteDetail, QuoteStatus } from "../../api/quotes";
import Quote from "./Quote";

vi.mock("../../api/client", () => ({
  api: {
    quotes: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      send: vi.fn(),
      copy: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      pdf: vi.fn(),
    },
    products: { list: vi.fn() },
    settings: { get: vi.fn() },
  },
}));

const company = {
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
};

const products: Product[] = [
  {
    id: 1,
    name: "Data migration",
    description: "Move records.",
    price_cents: 180_000,
    active: true,
  },
];

const settings: CompanySettings = {
  id: 1,
  ...company,
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

function detail(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 1,
    number: "QT-0001",
    deal_id: 5,
    deal_name: "Store rollout",
    organization_id: 7,
    organization_name: "Northwind Traders",
    status: "draft",
    created_at: "2026-11-26",
    valid_until: "2026-12-26",
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    subtotal_cents: 100_000,
    tax_cents: 8_875,
    total_cents: 108_875,
    created_by: "alex@brightloop.example",
    updated_by: "priya@brightloop.example",
    company,
    contact_name: "Ana Silva",
    lines: [
      {
        id: 1,
        quote_id: 1,
        product_id: 1,
        product_name: "Data migration",
        description: "Move records.",
        quantity: 1,
        unit_price_cents: 100_000,
        position: 0,
        amount_cents: 100_000,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.quotes.get).mockResolvedValue(detail());
  vi.mocked(api.products.list).mockResolvedValue(products);
  vi.mocked(api.settings.get).mockResolvedValue(settings);
  // The real URL, with the two file helpers jsdom leaves out.
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi
        .fn()
        .mockReturnValue("blob:quote") as unknown as typeof URL.createObjectURL;
      static revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    },
  );
});

function renderQuote(path = "/money/quotes/1", withLink = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/money/quotes/:id"
            element={
              <>
                <Quote />
                {withLink ? (
                  <Link to="/money/quotes/2">Second quote</Link>
                ) : null}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function buttonNames(): string[] {
  return screen
    .queryAllByRole("button")
    .map((button) => button.textContent ?? "");
}

describe("the quote page", () => {
  it("shows the document, the totals and the attribution lines", async () => {
    renderQuote();

    expect(
      await screen.findByRole("heading", { name: "QT-0001" }),
    ).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getAllByText("Brightloop").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Northwind Traders").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ana Silva").length).toBeGreaterThan(0);
    expect(screen.getByText("Dec 26, 2026")).toBeTruthy();
    expect(screen.getByText("$1,088.75")).toBeTruthy();
    expect(screen.getByText("Added by")).toBeTruthy();
    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
    expect(screen.getByText("Last changed by")).toBeTruthy();
    expect(screen.getByText("priya@brightloop.example")).toBeTruthy();
  });

  it("offers Send and Edit on a draft", async () => {
    renderQuote();

    await screen.findByRole("heading", { name: "QT-0001" });
    expect(buttonNames()).toEqual(["Edit", "Send"]);
  });

  it("offers Accept, Decline, Copy and Download PDF on a sent quote", async () => {
    vi.mocked(api.quotes.get).mockResolvedValue(detail({ status: "sent" }));
    renderQuote();

    await screen.findByRole("heading", { name: "QT-0001" });
    expect(buttonNames()).toEqual([
      "Accept",
      "Decline",
      "Copy",
      "Download PDF",
    ]);
  });

  it("offers the same on an expired quote, and only Copy and Download on a final one", async () => {
    vi.mocked(api.quotes.get).mockResolvedValue(detail({ status: "expired" }));
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });
    expect(buttonNames()).toEqual([
      "Accept",
      "Decline",
      "Copy",
      "Download PDF",
    ]);

    cleanup();
    for (const status of ["accepted", "declined"] as QuoteStatus[]) {
      vi.mocked(api.quotes.get).mockResolvedValue(detail({ status }));
      renderQuote();
      await screen.findByRole("heading", { name: "QT-0001" });
      expect(buttonNames()).toEqual(["Copy", "Download PDF"]);
      cleanup();
    }
  });

  it("sends a draft and shows the state it saved", async () => {
    vi.mocked(api.quotes.send).mockResolvedValue(detail({ status: "sent" }));
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(api.quotes.send).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Sent")).toBeTruthy();
  });

  it("shows an action's failure message", async () => {
    vi.mocked(api.quotes.send).mockRejectedValue(
      new Error("Only a draft can be changed."),
    );
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Only a draft can be changed.");
  });

  it("downloads the PDF named for the quote", async () => {
    vi.mocked(api.quotes.get).mockResolvedValue(detail({ status: "sent" }));
    vi.mocked(api.quotes.pdf).mockResolvedValue(new Blob(["%PDF"]));
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(api.quotes.pdf).toHaveBeenCalledWith(1));
  });

  it("edits a draft and repopulates the dialog from the saved reply", async () => {
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit quote" });
    expect(
      (within(dialog).getByLabelText("Quantity") as HTMLInputElement).value,
    ).toBe("1");
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    vi.mocked(api.quotes.update).mockResolvedValue(
      detail({
        valid_until: "2027-06-01",
        updated_by: "priya@brightloop.example",
        lines: [
          {
            id: 1,
            quote_id: 1,
            product_id: 1,
            product_name: "Data migration",
            description: "Move records.",
            quantity: 3,
            unit_price_cents: 100_000,
            position: 0,
            amount_cents: 300_000,
          },
        ],
      }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.quotes.update).toHaveBeenCalledWith(1, {
        valid_until: "2026-12-26",
        lines: [
          {
            product_id: 1,
            description: "Move records.",
            quantity: 2,
            unit_price_cents: 100_000,
          },
        ],
      }),
    );
    // The saved reply repopulates the dialog: the keyed form remounts on it,
    // so the dialog is fetched again.
    const refreshed = await screen.findByRole("dialog", { name: "Edit quote" });
    await waitFor(() =>
      expect(
        (within(refreshed).getByLabelText("Quantity") as HTMLInputElement)
          .value,
      ).toBe("3"),
    );
    expect(
      (within(refreshed).getByLabelText("Valid until") as HTMLInputElement)
        .value,
    ).toBe("2027-06-01");
  });

  it("refuses to edit a quote that is no longer a draft", async () => {
    vi.mocked(api.quotes.get).mockResolvedValue(detail({ status: "sent" }));
    renderQuote();
    await screen.findByRole("heading", { name: "QT-0001" });

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a second quote on the same route", async () => {
    renderQuote("/money/quotes/1", true);
    await screen.findByRole("heading", { name: "QT-0001" });
    vi.mocked(api.quotes.get).mockResolvedValue(
      detail({ id: 2, number: "QT-0002" }),
    );

    fireEvent.click(screen.getByRole("link", { name: "Second quote" }));

    expect(
      await screen.findByRole("heading", { name: "QT-0002" }),
    ).toBeTruthy();
    await waitFor(() => expect(api.quotes.get).toHaveBeenCalledWith(2));
  });
});
