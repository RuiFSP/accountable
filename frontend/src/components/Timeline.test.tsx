import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type Activity } from "../api/client";
import Timeline from "./Timeline";

vi.mock("../api/client", () => ({
  api: {
    activities: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A "YYYY-MM-DD" day offset from today, in local time. */
function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const activities: Activity[] = [
  {
    id: 1,
    type: "call",
    contact_id: 5,
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
    deal_id: 3,
    description: "Rollout note",
    happened_at: "2026-11-12T09:00:00",
    follow_up_date: isoDay(1),
    done: false,
  },
  {
    id: 3,
    type: "stage_change",
    contact_id: null,
    deal_id: 3,
    description: "Moved to Proposal",
    happened_at: "2026-11-13T09:00:00",
    follow_up_date: null,
    done: false,
  },
  {
    id: 4,
    type: "email",
    contact_id: 5,
    deal_id: null,
    description: "Follow-up sent",
    happened_at: "2026-11-13T09:00:00",
    follow_up_date: isoDay(-5),
    done: false,
  },
  {
    id: 5,
    type: "note",
    contact_id: 5,
    deal_id: null,
    description: "Prep notes",
    happened_at: "2026-11-11T09:00:00",
    follow_up_date: isoDay(-3),
    done: true,
  },
];

interface RenderOptions {
  activities?: Activity[];
  recordType?: "contact" | "deal";
  recordId?: number;
}

function renderTimeline(options: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <Timeline
        activities={options.activities ?? activities}
        recordType={options.recordType ?? "contact"}
        recordId={options.recordId ?? 5}
      />
    </QueryClientProvider>,
  );
}

function itemWith(description: string): HTMLLIElement {
  return screen.getByText(description).closest("li") as HTMLLIElement;
}

beforeEach(() => {
  vi.mocked(api.activities.create).mockResolvedValue(activities[0]);
  vi.mocked(api.activities.update).mockResolvedValue(activities[0]);
  vi.mocked(api.activities.remove).mockResolvedValue({});
});

describe("Timeline", () => {
  it("says so when nothing is logged yet", () => {
    renderTimeline({ activities: [] });

    expect(screen.getByText("Nothing logged yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log activity" })).toBeTruthy();
  });

  it("lists activities newest first with types, follow-ups and actions", () => {
    renderTimeline();

    const seen = [
      "Follow-up sent",
      "Moved to Proposal",
      "Rollout note",
      "Prep notes",
      "Call with Ana",
    ];
    const order = screen
      .getAllByRole("listitem")
      .map((item) =>
        seen.find((description) => item.textContent?.includes(description)),
      );
    expect(order).toEqual(seen);

    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getAllByText("Note")).toHaveLength(2);
    expect(screen.getByText("Stage change")).toBeTruthy();

    expect(screen.getByText("Follow-up: Tomorrow")).toBeTruthy();
    expect(screen.getByText("Follow-up: 5 days late")).toBeTruthy();
    expect(screen.getByText("Follow-up done")).toBeTruthy();

    const stageItem = itemWith("Moved to Proposal");
    expect(
      within(stageItem).queryByRole("button", { name: "Edit" }),
    ).toBeNull();
    expect(
      within(stageItem).queryByRole("button", { name: "Delete" }),
    ).toBeNull();

    const callItem = itemWith("Call with Ana");
    expect(within(callItem).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(
      within(callItem).getByRole("button", { name: "Delete" }),
    ).toBeTruthy();
  });

  it("logs a new activity through the form", async () => {
    renderTimeline();

    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    const dialog = await screen.findByRole("dialog", { name: "Log activity" });

    expect(
      (within(dialog).getByLabelText("Type") as HTMLSelectElement).value,
    ).toBe("note");
    const happened = within(dialog).getByLabelText(
      "Happened",
    ) as HTMLInputElement;
    expect(happened.value).not.toBe("");

    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "call" },
    });
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "  Call back tomorrow  " },
    });
    fireEvent.change(happened, { target: { value: "2026-11-20T14:30" } });
    fireEvent.change(within(dialog).getByLabelText("Follow-up"), {
      target: { value: isoDay(3) },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Done" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Log" }));

    expect(api.activities.create).toHaveBeenCalledWith({
      type: "call",
      contact_id: 5,
      deal_id: null,
      description: "Call back tomorrow",
      happened_at: "2026-11-20T14:30",
      follow_up_date: isoDay(3),
      done: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saves edits to an existing activity", async () => {
    renderTimeline({ recordType: "deal", recordId: 3 });

    fireEvent.click(
      within(itemWith("Prep notes")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit activity" });

    expect(
      (within(dialog).getByLabelText("Type") as HTMLSelectElement).value,
    ).toBe("note");
    expect(
      (within(dialog).getByLabelText("Description") as HTMLTextAreaElement)
        .value,
    ).toBe("Prep notes");
    expect(
      (within(dialog).getByLabelText("Happened") as HTMLInputElement).value,
    ).toBe("2026-11-11T09:00");
    expect(
      (within(dialog).getByLabelText("Follow-up") as HTMLInputElement).value,
    ).toBe(isoDay(-3));
    const doneBox = within(dialog).getByRole("checkbox", {
      name: "Done",
    }) as HTMLInputElement;
    expect(doneBox.checked).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Prep notes, tidied" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "email" },
    });
    fireEvent.change(within(dialog).getByLabelText("Follow-up"), {
      target: { value: "" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Done" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(api.activities.update).toHaveBeenCalledWith(5, {
      type: "email",
      contact_id: null,
      deal_id: 3,
      description: "Prep notes, tidied",
      happened_at: "2026-11-11T09:00",
      follow_up_date: null,
      done: false,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("deletes an activity after confirming", async () => {
    renderTimeline();

    const sentItem = itemWith("Follow-up sent");
    fireEvent.click(within(sentItem).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    expect(within(confirm).getByText("Follow-up sent")).toBeTruthy();

    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(api.activities.remove).toHaveBeenCalledWith(4);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the confirmation open when the server refuses the delete", async () => {
    vi.mocked(api.activities.remove).mockRejectedValue(new Error("In use."));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderTimeline();

    const sentItem = itemWith("Follow-up sent");
    fireEvent.click(within(sentItem).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete activity?",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.activities.remove).toHaveBeenCalledWith(4));
    expect(
      screen.getByRole("alertdialog", { name: "Delete activity?" }),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows the server's message when logging fails", async () => {
    vi.mocked(api.activities.create).mockRejectedValue(
      new Error("Too many activities."),
    );
    renderTimeline();

    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    const dialog = await screen.findByRole("dialog", { name: "Log activity" });
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Note to self" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Log" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many activities.");
    expect(screen.getByRole("dialog", { name: "Log activity" })).toBeTruthy();
  });

  it("cancels the log form and the edit form", async () => {
    renderTimeline();

    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    expect(
      await screen.findByRole("dialog", { name: "Log activity" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(
      within(itemWith("Call with Ana")).getByRole("button", { name: "Edit" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit activity" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.activities.update).not.toHaveBeenCalled();
  });
});

describe("who added an entry", () => {
  it("shows it beside when, and shows nothing when there is no one", () => {
    renderTimeline();

    expect(screen.queryByText(/@/)).toBeNull();

    cleanup();
    renderTimeline({
      activities: [
        {
          id: 9,
          type: "note",
          contact_id: 5,
          deal_id: null,
          description: "Signed the contract",
          happened_at: "2026-11-14T10:30:00",
          follow_up_date: null,
          done: false,
          created_by: "alex@brightloop.example",
        },
      ],
    });

    expect(screen.getByText("Signed the contract")).toBeTruthy();
    expect(screen.getByText(/· alex@brightloop\.example/)).toBeTruthy();
  });

  it("shows who changed it too, and only when that is someone else", () => {
    renderTimeline({
      activities: [
        {
          id: 9,
          type: "note",
          contact_id: 5,
          deal_id: null,
          description: "Signed the contract",
          happened_at: "2026-11-14T10:30:00",
          follow_up_date: null,
          done: false,
          created_by: "alex@brightloop.example",
          updated_by: "alex@brightloop.example",
        },
        {
          id: 10,
          type: "note",
          contact_id: 5,
          deal_id: null,
          description: "Amended the contract",
          happened_at: "2026-11-15T10:30:00",
          follow_up_date: null,
          done: false,
          created_by: "alex@brightloop.example",
          updated_by: "priya@brightloop.example",
        },
      ],
    });

    expect(screen.getByText(/· alex@brightloop\.example$/)).toBeTruthy();
    expect(
      screen.getByText(/alex@brightloop\.example → priya@brightloop\.example/),
    ).toBeTruthy();
  });
});
