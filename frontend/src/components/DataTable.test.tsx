import { type ColumnDef } from "@tanstack/react-table";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ReactNode } from "react";
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

interface SetupOptions {
  onEdit?: (row: Row) => void;
  onDelete?: (row: Row) => void;
  initialQuery?: string;
  initialQueryKey?: string;
  toolbar?: ReactNode;
  rowAction?: (row: Row) => ReactNode;
}

function table(
  options: SetupOptions = {},
  initialQueryKey = options.initialQueryKey,
) {
  return (
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
      initialQuery={options.initialQuery}
      initialQueryKey={initialQueryKey}
      toolbar={options.toolbar}
      rowAction={options.rowAction}
    />
  );
}

function setup(options: SetupOptions = {}) {
  return render(table(options));
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

  it("narrows by more than one filter at once", () => {
    const withCategory = rows.map((row) => ({
      ...row,
      category: row.name === "Alpha" ? "software" : "office",
    }));
    const categoryColumns: ColumnDef<(typeof withCategory)[number]>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "status", header: "Status" },
      { accessorKey: "value", header: "Value" },
      { accessorKey: "category", header: "Category" },
    ];
    render(
      <DataTable
        rows={withCategory}
        columns={categoryColumns}
        searchFields={(row) => [row.name, row.status, row.category]}
        searchPlaceholder="Search"
        filters={[
          {
            columnId: "status",
            label: "Status",
            options: [
              { value: "lead", label: "Lead" },
              { value: "customer", label: "Customer" },
            ],
          },
          {
            columnId: "category",
            label: "Category",
            options: [
              { value: "software", label: "Software" },
              { value: "office", label: "Office" },
            ],
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "lead" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "office" },
    });

    expect(visibleNames()).toEqual(["Zulu", "Beta"]);
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

  it("renders an optional row action with the right row", () => {
    const onRowAction = vi.fn();
    setup({
      rowAction: (row) => (
        <button type="button" onClick={() => onRowAction(row)}>
          {row.name === "Beta" ? "Restore" : "Archive"}
        </button>
      ),
    });

    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRowAction).toHaveBeenCalledWith(rows[2]);
  });

  it("renders an optional toolbar and leaves it out by default", () => {
    setup({
      toolbar: (
        <label>
          <input type="checkbox" aria-label="Show archived" />
          Show archived
        </label>
      ),
    });
    expect(
      screen.getByRole("checkbox", { name: "Show archived" }),
    ).toBeTruthy();

    cleanup();
    setup();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("applies an initial query on first paint", () => {
    setup({ initialQuery: "bet" });

    expect(visibleNames()).toEqual(["Beta"]);
    expect(
      (screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement)
        .value,
    ).toBe("bet");
  });

  it("re-applies the same initial query when its key changes", () => {
    const view = render(table({ initialQuery: "bet" }, "first"));
    const search = screen.getByRole("searchbox", {
      name: "Search",
    }) as HTMLInputElement;
    expect(search.value).toBe("bet");

    fireEvent.change(search, { target: { value: "" } });
    expect(search.value).toBe("");
    expect(visibleNames()).toEqual(["Zulu", "Alpha", "Beta"]);

    view.rerender(table({ initialQuery: "bet" }, "second"));
    expect(search.value).toBe("bet");
    expect(visibleNames()).toEqual(["Beta"]);
  });
});
