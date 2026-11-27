import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Product } from "../api/client";
import type { QuoteDetail, QuoteInput } from "../api/quotes";
import QuoteForm, { NO_LINES_MESSAGE, PRICE_MESSAGE } from "./QuoteForm";

afterEach(cleanup);

const products: Product[] = [
  {
    id: 1,
    name: "Data migration",
    description: "Move records from a legacy CRM into Accountable.",
    price_cents: 180_000,
    active: true,
  },
  {
    id: 2,
    name: "Annual support plan",
    description: null,
    price_cents: 240_000,
    active: true,
  },
  {
    id: 3,
    name: "Legacy add-on",
    description: "An older add-on kept for existing contracts.",
    price_cents: 3_900,
    active: false,
  },
];

const company = {
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
};

function savedReply(input: QuoteInput): QuoteDetail {
  return {
    id: 9,
    number: "QT-0001",
    deal_id: input.deal_id,
    deal_name: "Store rollout",
    organization_id: 7,
    organization_name: "Northwind Traders",
    status: "draft",
    created_at: "2026-11-26",
    valid_until: input.valid_until ?? "2026-12-26",
    tax_label: "Sales tax",
    tax_rate_thousandths: 8875,
    subtotal_cents: 180_000,
    tax_cents: 15_975,
    total_cents: 195_975,
    created_by: "alex@brightloop.example",
    updated_by: "alex@brightloop.example",
    company,
    contact_name: "Ana Silva",
    lines: input.lines.map((line, index) => ({
      id: index + 1,
      quote_id: 9,
      product_id: line.product_id,
      product_name: "Data migration",
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
      position: index,
      amount_cents: line.quantity * line.unit_price_cents,
    })),
  };
}

interface SetupOptions {
  quote?: QuoteDetail;
  onSubmit?: (payload: QuoteInput) => Promise<QuoteDetail>;
}

function setup(options: SetupOptions = {}) {
  const onSubmit =
    options.onSubmit ??
    vi.fn().mockImplementation(async (input: QuoteInput) => savedReply(input));
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <QuoteForm
      dealId={5}
      quote={options.quote}
      products={products}
      company={company}
      organizationName="Northwind Traders"
      contactName="Ana Silva"
      taxLabel="Sales tax"
      taxRateThousandths={8875}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onSaved, onCancel, ...view };
}

function addProduct(view: { container: HTMLElement }, name: string) {
  const select = view.container.querySelector(
    ".record-form select",
  ) as HTMLSelectElement;
  const option = Array.from(select.options).find(
    (item) => item.textContent === name,
  );
  fireEvent.change(select, { target: { value: option?.value ?? "" } });
}

function lineRows(view: { container: HTMLElement }): HTMLElement[] {
  return Array.from(view.container.querySelectorAll(".quote-form-line"));
}

function totalsText(view: { container: HTMLElement }): string {
  return view.container.querySelector(".quote-form-totals")?.textContent ?? "";
}

describe("QuoteForm", () => {
  it("offers only the active products and adds one as a line", () => {
    const view = setup();

    const options = Array.from(
      (view.container.querySelector(".record-form select") as HTMLSelectElement)
        .options,
    ).map((option) => option.textContent);
    expect(options).toEqual([
      "Add a product…",
      "Data migration",
      "Annual support plan",
    ]);

    addProduct(view, "Data migration");

    const [line] = lineRows(view);
    expect(line.textContent).toContain("Data migration");
    expect((line.querySelector("input") as HTMLInputElement).value).toBe(
      "Move records from a legacy CRM into Accountable.",
    );
    expect(line.textContent).toContain("$1,800.00");
  });

  it("removes a line again", () => {
    const view = setup();
    addProduct(view, "Data migration");
    addProduct(view, "Annual support plan");
    expect(lineRows(view)).toHaveLength(2);

    fireEvent.click(lineRows(view)[0].querySelector("button") as HTMLElement);

    expect(lineRows(view)).toHaveLength(1);
    expect(lineRows(view)[0].textContent).toContain("Annual support plan");
  });

  it("moves the amounts and the totals live as quantity and price change", () => {
    const view = setup();
    addProduct(view, "Data migration");
    addProduct(view, "Annual support plan");
    expect(totalsText(view)).toContain("Subtotal$4,200.00");
    expect(totalsText(view)).toContain("Sales tax (8.875%)$372.75");
    expect(totalsText(view)).toContain("Total$4,572.75");

    const [first, second] = lineRows(view);
    fireEvent.change(first.querySelectorAll("input")[1], {
      target: { value: "2" },
    });
    expect(first.textContent).toContain("$3,600.00");
    expect(totalsText(view)).toContain("Total$6,532.50");

    fireEvent.change(second.querySelectorAll("input")[2], {
      target: { value: "2,000" },
    });
    expect(second.textContent).toContain("$2,000.00");
    expect(totalsText(view)).toContain("Subtotal$5,600.00");
    expect(totalsText(view)).toContain("Total$6,097.00");
  });

  it("shows the preview beside the form with the same totals", () => {
    const view = setup();
    addProduct(view, "Data migration");

    const preview = view.container.querySelector(".quote-document");
    expect(preview?.textContent).toContain("Brightloop");
    expect(preview?.textContent).toContain("Northwind Traders");
    for (const amount of ["$1,800.00", "$159.75", "$1,959.75"]) {
      expect(preview?.textContent).toContain(amount);
      expect(totalsText(view)).toContain(amount);
    }
  });

  it("defaults the valid-until date thirty days out and keeps a change", () => {
    setup();
    const input = screen.getByLabelText("Valid until") as HTMLInputElement;
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    const pad = (value: number) => String(value).padStart(2, "0");
    expect(input.value).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    );

    fireEvent.change(input, { target: { value: "2027-06-01" } });
    expect(input.value).toBe("2027-06-01");
  });

  it("saves quantities and unit prices with no totals", async () => {
    const view = setup();
    const { onSubmit } = view;
    addProduct(view, "Data migration");

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Two passes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = (onSubmit as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as QuoteInput;
    expect(payload.deal_id).toBe(5);
    expect(payload.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.lines).toEqual([
      {
        product_id: 1,
        description: "Two passes.",
        quantity: 3,
        unit_price_cents: 180_000,
      },
    ]);
    expect(Object.keys(payload).sort()).toEqual([
      "deal_id",
      "lines",
      "valid_until",
    ]);
    expect(JSON.stringify(payload)).not.toContain("total");
    expect(JSON.stringify(payload)).not.toContain("amount");
  });

  it("shows the saving state and then repopulates from the saved reply", async () => {
    let release: (reply: QuoteDetail) => void = () => {};
    const pending = new Promise<QuoteDetail>((resolve) => {
      release = resolve;
    });
    const onSubmit = vi.fn().mockReturnValue(pending);
    const view = setup({ onSubmit });
    addProduct(view, "Data migration");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    release(
      savedReply({
        deal_id: 5,
        valid_until: "2027-01-15",
        lines: [
          {
            product_id: 2,
            description: "From the reply",
            quantity: 7,
            unit_price_cents: 240_000,
          },
        ],
      }),
    );

    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(
      (screen.getByLabelText("Valid until") as HTMLInputElement).value,
    ).toBe("2027-01-15");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "7",
    );
  });

  it("shows the server's message when the save is refused", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Only a draft can be changed."));
    const view = setup({ onSubmit });
    addProduct(view, "Data migration");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Only a draft can be changed.");
  });

  it("refuses out-of-bounds values on the form's error line", () => {
    const view = setup();
    const { onSubmit } = view;
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(NO_LINES_MESSAGE);

    addProduct(view, "Data migration");
    for (const [quantity, message] of [
      ["0", "Enter a whole number from 1 to 1,000,000"],
      ["1,000,001", "Enter a whole number from 1 to 1,000,000"],
    ]) {
      fireEvent.change(screen.getByLabelText("Quantity"), {
        target: { value: quantity },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(screen.getByRole("alert").textContent).toBe(message);
    }

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (USD)"), {
      target: { value: "ask later" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a price in US dollars, for example 49.50.",
    );

    fireEvent.change(screen.getByLabelText("Unit price (USD)"), {
      target: { value: "22,000,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(PRICE_MESSAGE);

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1000000" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (USD)"), {
      target: { value: "2,200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Keep each amount to $21,474,836.47 or less",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
