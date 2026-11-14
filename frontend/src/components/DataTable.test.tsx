import { type ColumnDef } from "@tanstack/react-table";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./DataTable";

interface Row {
  id: number;
  name: string;
  status: string;
  value: number;
}

const rows: Row[] = [
  { id: 1, name: "Zulu", status: "lead", value: 300 },
  { id: 2, name: "Alpha", status: "customer", value: 100 },
  { id: 3, name: "Beta", status: "lead", value: 200 },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "value", header: "Value" },
];

afterEach(cleanup);

function setup(
  options: { onEdit?: (row: Row) => void; onDelete?: (row: Row) => void } = {},
) {
  render(
    <DataTable
      rows={rows}
      columns={columns}
      searchFields={(row) => [row.name, row.status]}
      searchPlaceholder="Search"
      filter={{
        columnId: "status",
        label: "Status",
        options: [
          { value: "lead", label: "Lead" },
          { value: "customer", label: "Customer" },
        ],
      }}
      onAdd={vi.fn()}
      onEdit={options.onEdit}
      onDelete={options.onDelete}
    />,
  );
}

function visibleNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("DataTable", () => {
  it("shows every row and narrows them with the search box", () => {
    setup();

    expect(visibleNames()).toEqual(["Zulu", "Alpha", "Beta"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "bet" },
    });
    expect(visibleNames()).toEqual(["Beta"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "customer" },
    });
    expect(visibleNames()).toEqual(["Alpha"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "" },
    });
    expect(visibleNames()).toEqual(["Zulu", "Alpha", "Beta"]);
  });

  it("sorts by a column when its heading is clicked", () => {
    setup();

    const nameHeader = screen.getAllByRole("columnheader")[0];
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(visibleNames()).toEqual(["Alpha", "Beta", "Zulu"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(nameHeader.getAttribute("aria-sort")).toBe("descending");
    expect(visibleNames()).toEqual(["Zulu", "Beta", "Alpha"]);

    fireEvent.click(screen.getByRole("button", { name: "Value" }));
    expect(visibleNames()).toEqual(["Alpha", "Beta", "Zulu"]);
  });

  it("filters by status with the select", () => {
    setup();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "lead" },
    });
    expect(visibleNames()).toEqual(["Zulu", "Beta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "customer" },
    });
    expect(visibleNames()).toEqual(["Alpha"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "" },
    });
    expect(visibleNames()).toEqual(["Zulu", "Alpha", "Beta"]);
  });

  it("shows an empty message when nothing matches", () => {
    setup();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "nothing here" },
    });
    expect(screen.getByText("No matches.")).toBeTruthy();
  });

  it("calls back with the right row for edit and delete", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    setup({ onEdit, onDelete });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(onEdit).toHaveBeenCalledWith(rows[1]);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(onDelete).toHaveBeenCalledWith(rows[0]);
  });
});
