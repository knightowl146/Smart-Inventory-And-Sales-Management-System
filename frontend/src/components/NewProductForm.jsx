import { useState } from "react";
import { createProduct } from "../api/products";
import FormField from "./FormField";
import { suggestSku, suggestThreshold, validateDraft } from "../utils/newProductDraft";

/**
 * Add an invoice line to the catalogue without leaving the scan.
 *
 * Starts from what the invoice knows - a tidied name and the cost - and asks
 * for what only the owner can decide: the selling price above all. The SKU and
 * low-stock level are suggested as the category and price are filled in, and
 * stop updating the moment the owner types their own.
 *
 * The product is created with zero stock. The delivery itself is recorded by
 * the scan's Record button like every other line, so a product added here and
 * then left unticked has no phantom stock.
 */
const NewProductForm = ({ initial, products, idPrefix, onCreated, onCancel }) => {
  const [draft, setDraft] = useState(initial);
  const [skuEdited, setSkuEdited] = useState(false);
  const [thresholdEdited, setThresholdEdited] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field) => (event) => {
    const value = event.target.value;

    if (field === "sku") setSkuEdited(true);
    if (field === "lowStockThreshold") setThresholdEdited(true);

    // A complaint disappears as soon as the field it is about is touched -
    // including the SKU and alert level when a category or price fills them in.
    // Leaving a fixed field still flagged makes the form look broken.
    setErrors((previous) => {
      const next = { ...previous, [field]: undefined };
      if (field === "category" && !skuEdited) next.sku = undefined;
      if (field === "sellingPrice" && !thresholdEdited) next.lowStockThreshold = undefined;
      return next;
    });

    setDraft((previous) => {
      const next = { ...previous, [field]: value };

      if (field === "category" && !skuEdited) {
        next.sku = value.trim() ? suggestSku(value, products) : "";
      }
      if (field === "sellingPrice" && !thresholdEdited) {
        next.lowStockThreshold = value ? String(suggestThreshold(value)) : "";
      }

      return next;
    });
  };

  const cost = Number(draft.purchasePrice);
  const selling = Number(draft.sellingPrice);
  const margin = cost > 0 && selling > 0 ? Math.round(((selling - cost) / selling) * 100) : null;

  const submit = async () => {
    const found = validateDraft(draft, products);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setServerError("");

    try {
      const response = await createProduct({
        name: draft.name.trim(),
        sku: draft.sku.trim().toUpperCase(),
        category: draft.category.trim(),
        purchasePrice: cost,
        sellingPrice: selling,
        unitPrice: selling,
        quantity: 0,
        lowStockThreshold:
          draft.lowStockThreshold === "" ? suggestThreshold(selling) : Number(draft.lowStockThreshold),
        description: draft.description.trim(),
      });

      onCreated(response.data.data);
    } catch (err) {
      setServerError(err.message || "The product could not be created.");
      setSaving(false);
    }
  };

  const id = (field) => `${idPrefix}-${field}`;

  return (
    <div className="scan__new-product">
      <p className="scan__new-product-title">Add this line to your catalogue</p>

      {serverError && (
        <div className="error-banner" role="alert">
          {serverError}
        </div>
      )}

      <div className="scan__new-product-grid">
        <div className="scan__span-2">
          <FormField label="Product name" htmlFor={id("name")} error={errors.name}>
            <input id={id("name")} value={draft.name} onChange={set("name")} maxLength={100} />
          </FormField>
        </div>

        <FormField label="Category" htmlFor={id("category")} error={errors.category}>
          <input
            id={id("category")}
            list={id("categories")}
            value={draft.category}
            onChange={set("category")}
            placeholder="Pick or type a new one"
          />
          <datalist id={id("categories")}>
            {draft.categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </FormField>

        <FormField label="SKU" htmlFor={id("sku")} error={errors.sku}>
          <input id={id("sku")} value={draft.sku} onChange={set("sku")} placeholder="Suggested from the category" />
        </FormField>

        <FormField label="Cost price (from the invoice)" htmlFor={id("cost")} error={errors.purchasePrice}>
          <input id={id("cost")} type="number" min="1" step="1" value={draft.purchasePrice} onChange={set("purchasePrice")} />
        </FormField>

        <FormField label="Your selling price" htmlFor={id("selling")} error={errors.sellingPrice}>
          <input
            id={id("selling")}
            type="number"
            min="1"
            step="1"
            value={draft.sellingPrice}
            onChange={set("sellingPrice")}
            autoFocus
          />
          {margin !== null && !errors.sellingPrice && (
            <span className={margin <= 0 ? "form-field__error" : "field-hint scan__margin"}>
              {margin <= 0 ? `At or below cost (margin ${margin}%)` : `Margin ${margin}%`}
            </span>
          )}
        </FormField>

        <FormField label="Low-stock alert at" htmlFor={id("threshold")} error={errors.lowStockThreshold}>
          <input
            id={id("threshold")}
            type="number"
            min="0"
            step="1"
            value={draft.lowStockThreshold}
            onChange={set("lowStockThreshold")}
            placeholder="Set from the price"
          />
        </FormField>

        <div className="scan__span-all">
          <FormField label="Description" htmlFor={id("description")} error={errors.description}>
            <input id={id("description")} value={draft.description} onChange={set("description")} maxLength={500} />
          </FormField>
        </div>
      </div>

      <div className="scan__new-product-actions">
        <button type="button" className="btn btn--primary" onClick={submit} disabled={saving}>
          {saving ? "Creating…" : "Create product"}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <span className="field-hint">Created with no stock. Recording the scan adds this delivery.</span>
      </div>
    </div>
  );
};

export default NewProductForm;
