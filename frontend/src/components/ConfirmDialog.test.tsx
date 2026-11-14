import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Activity, Contact, Deal } from "../api/client";
import { cascadePreview } from "../lib/cascade";
import ConfirmDialog from "./ConfirmDialog";

const contacts: Contact[] = [
  {
    id: 1,
    name: "Ana Silva",
    email: null,
    phone: null,
    job_title: null,
    organization_id: 7,
    status: "customer",
  },
  {
    id: 2,
    name: "Ben Carter",
    email: null,
    phone: null,
    job_title: null,
    organization_id: 99,
    status: "lead",
  },
];

const deals: Deal[] = [
  {
    id: 1,
    name: "Store rollout",
    organization_id: 7,
    contact_id: 1,
    stage: "New",
    value_cents: 100_000,
    probability: 10,
    close_date: "2027-01-01",
    position: 0,
  },
  {
    id: 2,
    name: "Other org deal",
    organization_id: 99,
    contact_id: 2,
    stage: "New",
    value_cents: 50_000,
    probability: 10,
    close_date: "2027-02-01",
    position: 1,
  },
];

const activities: Activity[] = [
  {
    id: 1,
    type: "call",
    contact_id: 1,
    deal_id: null,
    description: "Call with Ana",
    happened_at: "2026-11-10T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 2,
    type: "note",
    contact_id: null,
    deal_id: 1,
    description: "Rollout note",
    happened_at: "2026-11-11T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 3,
    type: "email",
    contact_id: 2,
    deal_id: null,
    description: "Email to Ben",
    happened_at: "2026-11-12T09:00:00",
    follow_up_date: null,
    done: false,
  },
];

afterEach(cleanup);

describe("cascadePreview", () => {
  it("lists the exact contacts, deals and activities an organization delete takes", () => {
    const groups = cascadePreview("organization", 7, {
      contacts,
      deals,
      activities,
    });

    expect(groups).toEqual([
      { label: "Contacts", items: ["Ana Silva"] },
      { label: "Deals", items: ["Store rollout"] },
      { label: "Activities", items: ["Call with Ana", "Rollout note"] },
    ]);
  });

  it("lists only the activities of a contact or deal delete", () => {
    expect(
      cascadePreview("contact", 1, { contacts, deals, activities }),
    ).toEqual([{ label: "Activities", items: ["Call with Ana"] }]);
    expect(cascadePreview("deal", 1, { contacts, deals, activities })).toEqual([
      { label: "Activities", items: ["Rollout note"] },
    ]);
  });

  it("returns nothing for a record without links", () => {
    expect(
      cascadePreview("contact", 999, { contacts, deals, activities }),
    ).toEqual([]);
  });
});

describe("ConfirmDialog", () => {
  it("shows exactly the cascaded list before anything is deleted", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const groups = cascadePreview("organization", 7, {
      contacts,
      deals,
      activities,
    });

    render(
      <ConfirmDialog
        title="Delete Northwind Traders?"
        message="This cannot be undone."
        groups={groups}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Northwind Traders?" }),
    ).toBeTruthy();
    expect(screen.getByText("Ana Silva")).toBeTruthy();
    expect(screen.getByText("Store rollout")).toBeTruthy();
    expect(screen.getByText("Call with Ana")).toBeTruthy();
    expect(screen.getByText("Rollout note")).toBeTruthy();

    expect(screen.queryByText("Ben Carter")).toBeNull();
    expect(screen.queryByText("Other org deal")).toBeNull();
    expect(screen.queryByText("Email to Ben")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
