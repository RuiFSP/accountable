import { type FormEvent, useState } from "react";

import { type Product, type ProductInput } from "../api/client";
import { formatUsd, parseUsdToCents } from "../lib/money";
import Field from "./Field";
import Modal from "./Modal";

interface ProductFormProps {
  product?: Product;
  onSubmit: (payload: ProductInput) => Promise<void>;
  onCancel: () => void;
}

export default function ProductForm({
  product,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [priceText, setPriceText] = useState(
    product ? formatUsd(product.price_cents) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const priceCents = parseUsdToCents(priceText);
    if (priceCents === null) {
      setError("Enter a price in US dollars, for example 49.50.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        price_cents: priceCents,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the product.",
      );
    }
  };

  return (
    <Modal title={product ? "Edit product" : "Add product"} onClose={onCancel}>
      <form className="record-form" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Unit price (USD)" hint="Stored as whole cents.">
          <input
            required
            inputMode="decimal"
            placeholder="49.50"
            value={priceText}
            onChange={(event) => setPriceText(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {product ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
