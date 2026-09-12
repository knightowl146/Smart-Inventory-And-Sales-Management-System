import { useEffect, useMemo, useState } from "react";
import { getProducts, purchaseProduct } from "../api/products";
import { getSuppliers } from "../api/suppliers";
import { getMovements } from "../api/movements";
import DataTable from "../components/DataTable";
import FormField from "../components/FormField";
import Button from "../components/Button";

const emptyForm = { productId: "", supplierId: "", quantity: "1", unitPrice: "" };

const Purchases = () => {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [recentPurchases, setRecentPurchases] = useState([]);

  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [formValues, setFormValues] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const loadOptions = async () => {
    const [productsRes, suppliersRes] = await Promise.all([
      getProducts({ limit: 100 }),
      getSuppliers(),
    ]);
    setProducts(productsRes.data.data);
    setSuppliers(suppliersRes.data.data || []);
  };

  const loadRecentPurchases = async () => {
    setListLoading(true);
    setListError(null);

    try {
      const res = await getMovements({ type: "PURCHASE", limit: 10 });
      setRecentPurchases(res.data.data);
    } catch (err) {
      setListError(err.message);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadOptions().catch((err) => setListError(err.message));
    loadRecentPurchases();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === formValues.productId),
    [products, formValues.productId]
  );

  const handleProductChange = (event) => {
    const productId = event.target.value;
    const product = products.find((p) => p._id === productId);

    setFormValues((prev) => ({
      ...prev,
      productId,
      unitPrice: product ? String(product.purchasePrice) : prev.unitPrice,
    }));
  };

  const handleFieldChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        quantity: Number(formValues.quantity),
        unitPrice: Number(formValues.unitPrice),
        supplierId: formValues.supplierId,
      };

      await purchaseProduct(formValues.productId, payload);

      setSuccessMessage(`Purchased ${payload.quantity} unit(s) of ${selectedProduct?.name}.`);
      setFormValues(emptyForm);
      loadOptions();
      loadRecentPurchases();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: "product", header: "Product", render: (row) => row.product?.name || "—" },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "unitPrice", header: "Unit Price", align: "right", render: (row) => row.unitPrice.toFixed(2) },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => (row.quantity * row.unitPrice).toFixed(2),
    },
    { key: "newQuantity", header: "Stock After", align: "right" },
    { key: "createdAt", header: "Date", render: (row) => new Date(row.createdAt).toLocaleString() },
  ];

  return (
    <div className="split-layout">
      <div className="panel">
        <h2 className="panel__title">Record a purchase</h2>

        <form className="form-grid" onSubmit={handleSubmit}>
          {formError && <div className="error-banner"><p>{formError}</p></div>}
          {successMessage && <div className="success-banner"><p>{successMessage}</p></div>}

          <FormField label="Product" htmlFor="productId">
            <select id="productId" value={formValues.productId} onChange={handleProductChange} required>
              <option value="" disabled>Select a product</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name} ({product.quantity} in stock)
                </option>
              ))}
            </select>
          </FormField>

          {selectedProduct && (
            <p className="field-hint">
              Current stock: {selectedProduct.quantity} · Purchase price: {selectedProduct.purchasePrice.toFixed(2)}
            </p>
          )}

          <FormField label="Supplier" htmlFor="supplierId">
            <select id="supplierId" value={formValues.supplierId} onChange={handleFieldChange("supplierId")} required>
              <option value="" disabled>Select a supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Quantity" htmlFor="quantity">
            <input id="quantity" type="number" min="1" step="1" value={formValues.quantity} onChange={handleFieldChange("quantity")} required />
          </FormField>

          <FormField label="Unit price" htmlFor="unitPrice">
            <input id="unitPrice" type="number" min="0" step="0.01" value={formValues.unitPrice} onChange={handleFieldChange("unitPrice")} required />
          </FormField>

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Recording purchase…" : "Record purchase"}
          </Button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel__title">Recent purchases</h2>
        <DataTable
          columns={columns}
          rows={recentPurchases}
          rowKey={(row) => row._id}
          loading={listLoading}
          error={listError}
          onRetry={loadRecentPurchases}
          emptyMessage="No purchases recorded yet."
        />
      </div>
    </div>
  );
};

export default Purchases;