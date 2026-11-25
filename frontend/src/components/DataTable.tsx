import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  type FilterFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

export interface DataTableFilter {
  columnId: string;
  label: string;
  options: { value: string; label: string }[];
}

interface DataTableProps<T extends { id: number }> {
  rows: T[];
  columns: ColumnDef<T>[];
  searchFields: (row: T) => (string | null)[];
  searchPlaceholder?: string;
  filter?: DataTableFilter;
  /** More than one filter, such as a document's status and category. */
  filters?: DataTableFilter[];
  addLabel?: string;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onOpen?: (row: T) => void;
  emptyMessage?: string;
  /** A search text to apply when it arrives, as the top-bar product link does. */
  initialQuery?: string;
  /** Changes when a link is followed again, so the same search re-applies. */
  initialQueryKey?: string;
  /** Controls beside the search box, such as Show archived. */
  toolbar?: ReactNode;
  /** A row action beyond edit and delete, such as Archive or Restore. */
  rowAction?: (row: T) => ReactNode;
}

function makeSearchFilter<T extends { id: number }>(
  searchFields: (row: T) => (string | null)[],
): FilterFn<T> {
  return (row, _columnId, filterValue) => {
    const needle = String(filterValue).trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return searchFields(row.original).some((field) =>
      (field ?? "").toLowerCase().includes(needle),
    );
  };
}

function columnMatchesId<T>(column: ColumnDef<T>, columnId: string): boolean {
  if (column.id === columnId) {
    return true;
  }
  return "accessorKey" in column && column.accessorKey === columnId;
}

export default function DataTable<T extends { id: number }>({
  rows,
  columns,
  searchFields,
  searchPlaceholder = "Search",
  filter,
  filters,
  addLabel = "Add",
  onAdd,
  onEdit,
  onDelete,
  onOpen,
  emptyMessage = "No records yet.",
  initialQuery = "",
  initialQueryKey,
  toolbar,
  rowAction,
}: DataTableProps<T>) {
  const [query, setQuery] = useState(initialQuery);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const activeFilters = useMemo(
    () => filters ?? (filter ? [filter] : []),
    [filter, filters],
  );

  // A link can bring a new search while the table is already on screen; the
  // key makes the same search apply again when its link is followed twice.
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery, initialQueryKey]);

  const tableColumns = useMemo<ColumnDef<T>[]>(() => {
    const base = columns.map((column) =>
      activeFilters.some((activeFilter) =>
        columnMatchesId(column, activeFilter.columnId),
      )
        ? { ...column, filterFn: "equals" as const }
        : column,
    );
    if (!onEdit && !onDelete && !onOpen && !rowAction) {
      return base;
    }
    const actions: ColumnDef<T> = {
      id: "actions",
      header: "",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <div className="row-actions">
          {onOpen ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onOpen(row.original)}
            >
              View
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onEdit(row.original)}
            >
              Edit
            </button>
          ) : null}
          {rowAction ? rowAction(row.original) : null}
          {onDelete ? (
            <button
              type="button"
              className="link-button link-danger"
              onClick={() => onDelete(row.original)}
            >
              Delete
            </button>
          ) : null}
        </div>
      ),
    };
    return [...base, actions];
  }, [activeFilters, columns, onEdit, onDelete, onOpen, rowAction]);

  const columnFilters = useMemo(
    () =>
      activeFilters
        .filter((activeFilter) => filterValues[activeFilter.columnId])
        .map((activeFilter) => ({
          id: activeFilter.columnId,
          value: filterValues[activeFilter.columnId],
        })),
    [activeFilters, filterValues],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, globalFilter: query, columnFilters },
    onSortingChange: setSorting,
    sortDescFirst: false,
    globalFilterFn: makeSearchFilter(searchFields),
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visibleRows = table.getRowModel().rows;

  return (
    <div className="data-table-wrap">
      <div className="table-toolbar">
        <input
          type="search"
          className="search-input"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {activeFilters.map((activeFilter) => (
          <select
            key={activeFilter.columnId}
            className="filter-select"
            aria-label={activeFilter.label}
            value={filterValues[activeFilter.columnId] ?? ""}
            onChange={(event) =>
              setFilterValues((current) => ({
                ...current,
                [activeFilter.columnId]: event.target.value,
              }))
            }
          >
            <option value="">{activeFilter.label}: All</option>
            {activeFilter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
        {toolbar}
        <span className="toolbar-spacer" />
        {onAdd ? (
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            {addLabel}
          </button>
        ) : null}
      </div>

      <table className="data-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const ariaSort =
                  sorted === "asc"
                    ? "ascending"
                    : sorted === "desc"
                      ? "descending"
                      : "none";
                return (
                  <th key={header.id} scope="col" aria-sort={ariaSort}>
                    {header.isPlaceholder
                      ? null
                      : header.column.getCanSort()
                        ? (() => {
                            const label: ReactNode = flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            );
                            const arrow =
                              sorted === "asc"
                                ? "↑"
                                : sorted === "desc"
                                  ? "↓"
                                  : "↕";
                            return (
                              <button
                                type="button"
                                className="th-sort"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {label}
                                <span className="sort-arrow" aria-hidden="true">
                                  {arrow}
                                </span>
                              </button>
                            );
                          })()
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p className="muted table-empty">{emptyMessage}</p>
      ) : visibleRows.length === 0 ? (
        <p className="muted table-empty">No matches.</p>
      ) : null}
    </div>
  );
}
