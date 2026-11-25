import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AddedPanels, { type RecordPanel } from "./RecordPanels";

interface Record {
  id: number;
  name: string;
}

const QuotePanel: RecordPanel<Record> = {
  name: "quotes",
  Panel: ({ record }) => <p>Quotes for {record.name}</p>,
};
const BillPanel: RecordPanel<Record> = {
  name: "bills",
  Panel: ({ record }) => <p>Bills for {record.name}</p>,
};

describe("AddedPanels", () => {
  it("renders nothing when no area adds a panel", () => {
    const { container } = render(
      <AddedPanels panels={[]} record={{ id: 1, name: "Acme" }} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders each panel with the record, in order", () => {
    render(
      <AddedPanels
        panels={[QuotePanel, BillPanel]}
        record={{ id: 1, name: "Acme" }}
      />,
    );

    expect(screen.getByText("Quotes for Acme")).toBeTruthy();
    expect(screen.getByText("Bills for Acme")).toBeTruthy();
  });
});
