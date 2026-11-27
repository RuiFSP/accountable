import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bill, BillInput, Organization } from "../../api/client";
import BillForm from "./BillForm";

const organizations: Organization[] = [
  {
    id: 7,
    name: "Vantage Software",
    website: null,
    industry: null,
    notes: null,
    created_by: null,
    updated_by: null,
  },
  {
    id: 8,
    name: "Riverview Property",
    website: null,
    industry: null,
    notes: null,
    created_by: null,
    updated_by: null,
  },
];

const bill: Bill = {
  id: 1,
  organization_id: 8,
  organization_name: "Riverview Property",
  bill_number: "RP-2026-06",
  bill_date: "2026-06-01",
  due_date: "2026-07-01",
  category: "Office",
  amount_cents: 85_000,
  tax_cents: 6_800,
  total_cents: 91_800,
  notes: "Office rent.",
  paid_date: "2026-06-04",
  status: "paid",
  created_by: "alex@brightloop.example",
  updated_by: "priya@brightloop.example",
};

function renderForm(
  onSubmit: (payload: BillInput) => Promise<void>,
  editing?: Bill,
) {
  return render(
    <BillForm
      organizations={organizations}
      bill={editing}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
}

function valueOf(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BillForm", () => {
  it("starts with the due date 30 days after the bill date and keeps moving it until the due date is edited by hand", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    renderForm(async () => {});

    expect(valueOf("Bill date")).toBe("2026-06-15");
    expect(valueOf("Due date")).toBe("2026-07-15");

    fireEvent.change(screen.getByLabelText("Bill date"), {
      target: { value: "2026-03-01" },
    });
    expect(valueOf("Due date")).toBe("2026-03-31");

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-04-15" },
    });
    fireEvent.change(screen.getByLabelText("Bill date"), {
      target: { value: "2026-05-01" },
    });
    expect(valueOf("Due date")).toBe("2026-04-15");
  });

  it("chooses the supplier from the organizations", () => {
    renderForm(async () => {});

    const supplier = screen.getByLabelText("Supplier") as HTMLSelectElement;
    expect([...supplier.options].map((option) => option.textContent)).toEqual([
      "Vantage Software",
      "Riverview Property",
    ]);
    expect(supplier.value).toBe("7");
    fireEvent.change(supplier, { target: { value: "8" } });
    expect(supplier.value).toBe("8");
  });

  it("parses the amounts to cents and previews the total as their sum", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText("Bill number"), {
      target: { value: "VS-2026-09" },
    });
    fireEvent.change(screen.getByLabelText("Amount before tax (USD)"), {
      target: { value: "1,250.50" },
    });
    fireEvent.change(screen.getByLabelText("Tax (USD)"), {
      target: { value: "100.05" },
    });
    expect(screen.getByText("Total: $1,350.55")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount_cents: 125_050, tax_cents: 10_005 }),
    );
  });

  it("offers exactly the six categories", () => {
    renderForm(async () => {});

    const category = screen.getByLabelText("Category") as HTMLSelectElement;
    expect([...category.options].map((option) => option.textContent)).toEqual([
      "Software",
      "Contractors",
      "Travel",
      "Office",
      "Marketing",
      "Other",
    ]);
  });

  it("pre-fills every field on edit and shows who added and who changed the bill", () => {
    renderForm(async () => {}, bill);

    expect(valueOf("Bill number")).toBe("RP-2026-06");
    expect(valueOf("Bill date")).toBe("2026-06-01");
    expect(valueOf("Due date")).toBe("2026-07-01");
    expect(valueOf("Amount before tax (USD)")).toBe("$850.00");
    expect(valueOf("Tax (USD)")).toBe("$68.00");
    expect(screen.getByText("Total: $918.00")).toBeTruthy();
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "Office",
    );
    expect(valueOf("Notes")).toBe("Office rent.");

    const dialog = screen.getByRole("dialog", { name: "Edit bill" });
    expect(within(dialog).getByText("Added by")).toBeTruthy();
    expect(within(dialog).getByText("alex@brightloop.example")).toBeTruthy();
    expect(within(dialog).getByText("Last changed by")).toBeTruthy();
    expect(within(dialog).getByText("priya@brightloop.example")).toBeTruthy();
  });

  it("shows the API's duplicate message in the form", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'A bill numbered "RP-2026-06" already exists for this supplier.',
        ),
      );
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText("Bill number"), {
      target: { value: "RP-2026-06" },
    });
    fireEvent.change(screen.getByLabelText("Amount before tax (USD)"), {
      target: { value: "850" },
    });
    fireEvent.change(screen.getByLabelText("Tax (USD)"), {
      target: { value: "68" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      'A bill numbered "RP-2026-06" already exists for this supplier.',
    );
    expect(screen.getByRole("dialog", { name: "Add bill" })).toBeTruthy();
  });

  it("sends the trimmed bill number, and no total and no paid date", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText("Bill number"), {
      target: { value: "  VS-2026-09  " },
    });
    fireEvent.change(screen.getByLabelText("Amount before tax (USD)"), {
      target: { value: "49.50" },
    });
    fireEvent.change(screen.getByLabelText("Tax (USD)"), {
      target: { value: "4.95" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).toHaveBeenCalledWith({
      organization_id: 7,
      bill_number: "VS-2026-09",
      bill_date: valueOf("Bill date"),
      due_date: valueOf("Due date"),
      category: "Software",
      amount_cents: 4_950,
      tax_cents: 495,
      notes: null,
    });
  });

  it("keeps the dialog open on its values when a save fails", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Could not save the bill."));
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText("Bill number"), {
      target: { value: "VS-2026-09" },
    });
    fireEvent.change(screen.getByLabelText("Amount before tax (USD)"), {
      target: { value: "49.50" },
    });
    fireEvent.change(screen.getByLabelText("Tax (USD)"), {
      target: { value: "4.95" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not save the bill.");
    expect(valueOf("Bill number")).toBe("VS-2026-09");
    expect(valueOf("Amount before tax (USD)")).toBe("49.50");
  });
});
