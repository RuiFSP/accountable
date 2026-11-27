import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanySettings, InvoiceDetail, Product } from "../api/client";
import { totals } from "../lib/tax";
import InvoiceForm, { type InvoiceFormProps } from "./InvoiceForm";

const settings: CompanySettings = {
  id: 1,
  name: "Brightloop",
  address: "1 Brightloop Plaza\nNew York, NY 10004",
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
  updated_at: "2026-11-24T09:00:00Z",
};

const products: Product[] = [
  {
    id: 1,
    name: "Design",
    description: null,
    price_cents: 50_000,
    active: true,
    created_by: null,
    updated_by: null,
  },
  {
    id: 2,
    name: "Build",
    description: null,
    price_cents: 25_000,
    active: true,
    created_by: null,
    updated_by: null,
  },
  {
    id: 3,
    name: "Retired thing",
    description: null,
    price_cents: 10_000,
    active: false,
    created_by: null,
    updated_by: null,
  },
];

const draft: InvoiceDetail = {
  id: 7,
  number: null,
  deal_id: 3,
  organization_id: 2,
  deal_name: "Website build",
  organization_name: "Acme",
  status: "draft",
  issue_date: null,
  due_date: null,
  subtotal_cents: 120_000,
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  tax_cents: 10_650,
  total_cents: 130_650,
  paid_cents: 0,
  balance_cents: null,
  bill_to_name: "Acme",
  bill_to_address: "1 Acme Way",
  bill_to_contact_name: "Pat Lee",
  bill_to_contact_email: "pat@acme.example",
  created_by: "alex@brightloop.example",
  updated_by: "alex@brightloop.example",
  lines: [
    {
      id: 11,
      invoice_id: 7,
      product_id: null,
      description: "Design",
      quantity: 1,
      unit_price_cents: 120_000,
      position: 0,
    },
  ],
  payments: [],
};

afterEach(cleanup);

function renderForm(overrides: Partial<InvoiceFormProps> = {}): {
  onSave: ReturnType<typeof vi.fn<NonNullable<InvoiceFormProps["onSave"]>>>;
  onIssue: ReturnType<typeof vi.fn<NonNullable<InvoiceFormProps["onIssue"]>>>;
} {
  const onSave = vi
    .fn<NonNullable<InvoiceFormProps["onSave"]>>()
    .mockResolvedValue(draft);
  const onIssue = vi
    .fn<NonNullable<InvoiceFormProps["onIssue"]>>()
    .mockResolvedValue();
  render(
    <InvoiceForm
      deal={{ id: 3, name: "Website build", value_cents: 120_000 }}
      billTo={{
        name: "Acme",
        address: "1 Acme Way",
        contactName: "Pat Lee",
        contactEmail: "pat@acme.example",
      }}
      products={products}
      settings={settings}
      onSave={onSave}
      onIssue={onIssue}
      onCancel={() => {}}
      {...overrides}
    />,
  );
  return { onSave, onIssue };
}

function allocation(): string {
  return screen.getByText(/Still to allocate/).parentElement?.textContent ?? "";
}

function amountCell(): string {
  return (
    document.querySelector(".invoice-line-table tbody td.num")?.textContent ??
    ""
  );
}

function totalsBlock(): string {
  return document.querySelector(".sheet-totals")?.textContent ?? "";
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
}

describe("InvoiceForm", () => {
  it("starts with one line carrying the whole deal's value", () => {
    renderForm();

    expect(
      (screen.getByLabelText("Description") as HTMLInputElement).value,
    ).toBe("Website build");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "1",
    );
    expect(
      (screen.getByLabelText("Unit price") as HTMLInputElement).value,
    ).toBe("$1,200.00");
  });

  it("follows lib/tax.ts for the line amount and the totals as the person types", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Unit price"), {
      target: { value: "$300.00" },
    });

    // The same sums lib/tax.ts makes of these lines at the settings' rate.
    expect(totals([{ quantity: 2, unit_price_cents: 30_000 }], 8875)).toEqual({
      subtotal_cents: 60_000,
      tax_cents: 5_325,
      total_cents: 65_325,
    });
    expect(amountCell()).toBe("$600.00");
    expect(totalsBlock()).toContain("$600.00");
    expect(totalsBlock()).toContain("$53.25");
    expect(totalsBlock()).toContain("$653.25");
  });

  it("shows the deal's value and what is still to allocate and will not save while the two differ", () => {
    renderForm();

    expect(allocation()).toContain("Deal value $1,200.00");
    expect(allocation()).toContain("Still to allocate $0.00");
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Unit price"), {
      target: { value: "$1,000.00" },
    });

    expect(allocation()).toContain("Still to allocate $200.00");
    expect(saveButton().disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Save and issue",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Unit price"), {
      target: { value: "$1,200.00" },
    });

    expect(allocation()).toContain("Still to allocate $0.00");
    expect(saveButton().disabled).toBe(false);
  });

  it("updates the preview beside it with every change", () => {
    renderForm();
    const preview = screen.getByLabelText("Invoice document");

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Retainer <b>1</b>" },
    });

    expect(preview.textContent).toContain("Retainer <b>1</b>");

    fireEvent.change(screen.getByLabelText("Add a line from a product"), {
      target: { value: "1" },
    });

    expect(preview.textContent).toContain("Design");
    expect(preview.textContent).toContain("$500.00");
    expect(screen.queryByText("Retired thing")).toBeNull();
  });

  it("saves what changed and shows what the server stored", async () => {
    const { onSave } = renderForm({ invoice: draft });

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Design retainer  " },
    });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        {
          product_id: null,
          description: "Design retainer",
          quantity: 1,
          unit_price_cents: 120_000,
        },
      ]),
    );
    // The reply is what the server stored: the form shows that.
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Description") as HTMLInputElement).value,
      ).toBe("Design"),
    );
    expect(screen.getByRole("status").textContent).toBe("Saved.");
  });

  it("leaves the form showing what the server stored after a save that changes nothing", async () => {
    const { onSave } = renderForm({ invoice: draft });

    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(
      (screen.getByLabelText("Description") as HTMLInputElement).value,
    ).toBe("Design");
    expect(
      (screen.getByLabelText("Unit price") as HTMLInputElement).value,
    ).toBe("$1,200.00");
  });

  it("issues from the dialog with the chosen date after saving the lines", async () => {
    const { onSave, onIssue } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save and issue" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() =>
      expect(onIssue).toHaveBeenCalledWith(
        draft,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ),
    );
    const [lines] = onSave.mock.calls[0];
    expect(lines).toEqual([
      {
        product_id: null,
        description: "Website build",
        quantity: 1,
        unit_price_cents: 120_000,
      },
    ]);
  });

  it("refuses to issue with no issue date and says so without saving", async () => {
    const { onSave, onIssue } = renderForm();

    fireEvent.change(screen.getByLabelText("Issue date"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and issue" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Choose an issue date.",
      ),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("shows the server's message when the save is refused", async () => {
    const onSave = vi
      .fn<NonNullable<InvoiceFormProps["onSave"]>>()
      .mockRejectedValue(
        new Error("The lines must add up to the deal's value."),
      );
    renderForm({ onSave });

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "The lines must add up to the deal's value.",
      ),
    );
  });

  it("refuses a line with no description or a quantity out of range", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "0" },
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a whole number from 1 to 1,000,000",
    );
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  " },
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Each line needs a description.",
    );
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps a line's product so the save can carry it", async () => {
    const { onSave } = renderForm();

    fireEvent.change(screen.getByLabelText("Add a line from a product"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getAllByLabelText("Unit price")[1], {
      target: { value: "$300.00" },
    });
    fireEvent.change(screen.getAllByLabelText("Quantity")[0], {
      target: { value: "3" },
    });
    fireEvent.change(screen.getAllByLabelText("Unit price")[0], {
      target: { value: "$300.00" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [lines] = onSave.mock.calls[0];
    expect(lines[0].product_id).toBeNull();
    expect(lines[1].product_id).toBe(1);
  });
});
