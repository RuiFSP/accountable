import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Deal, DealInput } from "../api/client";
import DealForm from "./DealForm";

afterEach(cleanup);

const organizations = [
  { id: 7, name: "Northwind Traders" },
  { id: 9, name: "Contoso" },
];

const contacts = [
  { id: 1, name: "Ana Silva" },
  { id: 2, name: "Ben Carter" },
];

const deal: Deal = {
  id: 3,
  name: "Store rollout",
  organization_id: 7,
  contact_id: 1,
  stage: "Proposal",
  value_cents: 125_000,
  probability: 40,
  close_date: "2027-03-01",
  position: 4,
};

interface SetupOptions {
  deal?: Deal;
  initialStage?: Deal["stage"];
  onSubmit?: (payload: DealInput) => Promise<void>;
}

function setup(options: SetupOptions = {}) {
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <DealForm
      organizations={organizations}
      contacts={contacts}
      deal={options.deal}
      initialStage={options.initialStage}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function select(label: string): HTMLSelectElement {
  return screen.getByLabelText(label) as HTMLSelectElement;
}

function fillRequiredFields() {
  fireEvent.change(input("Name"), { target: { value: "Store rollout" } });
  fireEvent.change(select("Organization"), { target: { value: "7" } });
  fireEvent.change(input("Value (USD)"), { target: { value: "500" } });
  fireEvent.change(input("Close date"), { target: { value: "2027-06-01" } });
}

describe("DealForm", () => {
  it("starts an add form blank with the New stage's usual probability", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeTruthy();
    expect(input("Name").value).toBe("");
    expect(select("Organization").value).toBe("");
    expect(select("Contact").value).toBe("");
    expect(select("Stage").value).toBe("New");
    expect(input("Probability (%)").value).toBe("10");
    expect(input("Value (USD)").value).toBe("");
    expect(input("Close date").value).toBe("");
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("preselects a stage and its usual probability when added into a column", () => {
    setup({ initialStage: "Negotiation" });

    expect(select("Stage").value).toBe("Negotiation");
    expect(input("Probability (%)").value).toBe("75");
  });

  it("keeps a hand-tuned probability until the stage changes", () => {
    setup();

    fireEvent.change(input("Probability (%)"), { target: { value: "33" } });
    expect(input("Probability (%)").value).toBe("33");

    fireEvent.change(select("Stage"), { target: { value: "Proposal" } });
    expect(select("Stage").value).toBe("Proposal");
    expect(input("Probability (%)").value).toBe("50");
  });

  it("submits a filled add form with parsed money and no contact", () => {
    const { onSubmit } = setup();

    fireEvent.change(input("Name"), { target: { value: "  Fresh deal  " } });
    fireEvent.change(select("Organization"), { target: { value: "9" } });
    fireEvent.change(select("Stage"), { target: { value: "Proposal" } });
    fireEvent.change(input("Probability (%)"), { target: { value: "60" } });
    fireEvent.change(input("Value (USD)"), { target: { value: "$12,500.50" } });
    fireEvent.change(input("Close date"), { target: { value: "2027-06-01" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Fresh deal",
      organization_id: 9,
      contact_id: null,
      stage: "Proposal",
      value_cents: 1_250_050,
      probability: 60,
      close_date: "2027-06-01",
      position: null,
    });
  });

  it("refuses an invalid amount and accepts it once corrected", () => {
    const { onSubmit } = setup();

    fireEvent.change(input("Name"), { target: { value: "Broken amount" } });
    fireEvent.change(select("Organization"), { target: { value: "7" } });
    fireEvent.change(input("Value (USD)"), { target: { value: "ask later" } });
    fireEvent.change(input("Close date"), { target: { value: "2027-06-01" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter an amount in US dollars, for example 12,500.",
    );

    fireEvent.change(input("Value (USD)"), { target: { value: "1,200" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ value_cents: 120_000 }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server's message when saving fails", async () => {
    setup({ onSubmit: vi.fn().mockRejectedValue(new Error("Name is taken.")) });
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Name is taken.");
    expect(screen.getByRole("dialog", { name: "Add deal" })).toBeTruthy();
  });

  it("falls back to a generic message when saving fails oddly", async () => {
    setup({ onSubmit: vi.fn().mockRejectedValue("nope") });
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not save the deal.");
  });

  it("opens an edit form filled from the deal and saves it back", () => {
    const { onSubmit } = setup({ deal });

    expect(screen.getByRole("dialog", { name: "Edit deal" })).toBeTruthy();
    expect(input("Name").value).toBe("Store rollout");
    expect(select("Organization").value).toBe("7");
    expect(select("Contact").value).toBe("1");
    expect(select("Stage").value).toBe("Proposal");
    expect(input("Probability (%)").value).toBe("40");
    expect(input("Value (USD)").value).toBe("$1,250");
    expect(input("Close date").value).toBe("2027-03-01");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();

    fireEvent.change(select("Contact"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Store rollout",
      organization_id: 7,
      contact_id: 2,
      stage: "Proposal",
      value_cents: 125_000,
      probability: 40,
      close_date: "2027-03-01",
      position: 4,
    });
  });

  it("starts an edit for a deal whose contact and close date are missing", () => {
    const { onSubmit } = setup({
      deal: { ...deal, contact_id: null, close_date: null },
    });

    expect(select("Contact").value).toBe("");
    expect(
      (screen.getByRole("option", { name: "None" }) as HTMLOptionElement)
        .selected,
    ).toBe(true);
    expect(input("Close date").value).toBe("");

    fireEvent.change(input("Close date"), { target: { value: "2027-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: null,
        close_date: "2027-04-01",
        position: 4,
      }),
    );
  });

  it("cancels from the Cancel button, the close button and Escape", () => {
    const { onCancel } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});
