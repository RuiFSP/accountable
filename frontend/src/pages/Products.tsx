import { type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { api, type Product, type ProductInput } from "../api/client";
import DataTable from "../components/DataTable";
import ProductForm from "../components/ProductForm";
import { formatUsdWithCents } from "../lib/money";

export default function Products() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [includeArchived, setIncludeArchived] = useState(false);
  const productsQuery = useQuery({
    queryKey: ["products", includeArchived],
    queryFn: () => api.products.list(includeArchived),
    // Toggling Show archived keeps the table and its toolbar on screen while
    // the other list arrives, instead of blanking to Loading…
    placeholderData: (previous) => previous,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const products = productsQuery.data ?? [];

  const columns: ColumnDef<Product>[] = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "description",
      header: "Description",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
    {
      accessorKey: "price_cents",
      header: "Unit price",
      cell: (info) => (
        <span className="num">
          {formatUsdWithCents(info.getValue() as number)}
        </span>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: (info) =>
        info.getValue() ? (
          <span className="badge badge-active">Active</span>
        ) : (
          <span className="badge badge-archived">Archived</span>
        ),
    },
    {
      accessorKey: "created_by",
      header: "Added by",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
    {
      accessorKey: "updated_by",
      header: "Last changed by",
      cell: (info) => (info.getValue() as string | null) ?? "—",
    },
  ];

  const refreshProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["products"] });

  const handleCreate = async (payload: ProductInput) => {
    await api.products.create(payload);
    await refreshProducts();
    setAdding(false);
  };

  const handleUpdate = async (payload: ProductInput) => {
    if (!editing) {
      return;
    }
    await api.products.update(editing.id, payload);
    await refreshProducts();
    setEditing(null);
  };

  const handleStateChange = async (product: Product) => {
    setActionError(null);
    try {
      if (product.active) {
        await api.products.archive(product.id);
      } else {
        await api.products.restore(product.id);
      }
      await refreshProducts();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not change the product.",
      );
    }
  };

  return (
    <div>
      <h1>Products</h1>
      <div className="panel">
        {productsQuery.isError ? (
          <p className="form-error" role="alert">
            Could not load products.
          </p>
        ) : productsQuery.isLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            {actionError ? (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <DataTable
              rows={products}
              columns={columns}
              searchFields={(row) => [row.name, row.description]}
              searchPlaceholder="Search products"
              addLabel="Add product"
              initialQuery={initialQuery}
              initialQueryKey={location.key}
              toolbar={
                <label className="toolbar-label">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(event) =>
                      setIncludeArchived(event.target.checked)
                    }
                  />
                  Show archived
                </label>
              }
              onAdd={() => setAdding(true)}
              onEdit={setEditing}
              rowAction={(product) => (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    void handleStateChange(product);
                  }}
                >
                  {product.active ? "Archive" : "Restore"}
                </button>
              )}
            />
          </>
        )}
      </div>

      {adding ? (
        <ProductForm
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <ProductForm
          product={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
