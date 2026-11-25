import { type FormEvent, useState } from "react";

import { type Product, type ProductInput } from "../api/client";
import { formatUsdWithCents, parseUsdToCents } from "../lib/money";
import Field from "./Field";
import Modal from "./Modal";

// The API's own limit (backend/app/routes/products.py): what the integer
// column stores, refused here so the form needn't show a raw status message.
const MAX_PRICE_CENTS = 2_147_483_647;

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
    product ? formatUsdWithCents(product.price_cents) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const priceCents = parseUsdToCents(priceText);
    if (priceCents === null) {
      setError("Enter a price in US dollars, for example 49.50.");
      return;
    }
    if (priceCents > MAX_PRICE_CENTS) {
      setError("Enter a price of $21,474,836.47 or less.");
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
        <Field label="Unit price (USD)">
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
