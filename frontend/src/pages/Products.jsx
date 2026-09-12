import { useEffect, useState } from "react";
import { getProducts, createProduct, updateProduct, deleteProduct } from "../api/products";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import FormField from "../components/FormField";
import Button from "../components/Button";
import Pagination from "../components/Pagination";

const emptyForm = {
  name: "",
  sku: "",
  category: "",
  purchasePrice: "",
  sellingPrice: "",
  unitPrice: "",
  quantity: "",
  lowStockThreshold: "10",
  description: "",
};

const toFormValues = (product) => ({
  name: product.name ?? "",
  sku: product.sku ?? "",
  category: product.category ?? "",
  purchasePrice: String(product.purchasePrice ?? ""),
  sellingPrice: String(product.sellingPrice ?? ""),
  unitPrice: String(product.unitPrice ?? ""),
  quantity: String(product.quantity ?? ""),
  lowStockThreshold: String(product.lowStockThreshold ?? ""),
  description: product.description ?? "",
});

const Products = () => {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null); // "create" | "edit" | null
  const [activeProduct, setActiveProduct] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getProducts({ page, limit: 10, search: search || undefined });
      setProducts(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openCreateModal = () => {
    setModalMode("create");
    setActiveProduct(null);
    setFormValues(emptyForm);
    setFormError(null);
  };

  const openEditModal = (product) => {
    setModalMode("edit");
    setActiveProduct(product);
    setFormValues(toFormValues(product));
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveProduct(null);
    setFormError(null);
  };

  const handleFieldChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      if (modalMode === "create") {
        const payload = {
          name: formValues.name.trim(),
          sku: formValues.sku.trim(),
          category: formValues.category.trim(),
          purchasePrice: Number(formValues.purchasePrice),
          sellingPrice: Number(formValues.sellingPrice),
          unitPrice: Number(formValues.unitPrice),
          quantity: Number(formValues.quantity),
          lowStockThreshold: Number(formValues.lowStockThreshold),
          description: formValues.description.trim(),
        };
        await createProduct(payload);
      } else if (modalMode === "edit") {
        const payload = {
          name: formValues.name.trim(),
          category: formValues.category.trim(),
          purchasePrice: Number(formValues.purchasePrice),
          sellingPrice: Number(formValues.sellingPrice),
          quantity: Number(formValues.quantity),
          lowStockThreshold: Number(formValues.lowStockThreshold),
          description: formValues.description.trim(),
        };
        await updateProduct(activeProduct._id, payload);
      }

      closeModal();
      loadProducts();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      await deleteProduct(deleteTarget._id);
      setDeleteTarget(null);
      loadProducts();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "name", header: "Name" },
    { key: "sku", header: "SKU" },
    { key: "category", header: "Category" },
    {
      key: "quantity",
      header: "Stock",
      align: "right",
      render: (row) => (
        <span className={row.quantity <= row.lowStockThreshold ? "badge badge--warning" : undefined}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: "sellingPrice",
      header: "Selling Price",
      align: "right",
      render: (row) => row.sellingPrice.toFixed(2),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="row-actions">
          <Button variant="secondary" onClick={() => openEditModal(row)}>Edit</Button>
          <Button variant="danger" onClick={() => setDeleteTarget(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by name or SKU"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <Button variant="primary" onClick={openCreateModal}>Add product</Button>
      </div>

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(row) => row._id}
        loading={loading}
        error={error}
        onRetry={loadProducts}
        emptyMessage="No products found."
      />

      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPageChange={setPage}
      />

      {modalMode && (
        <Modal
          title={modalMode === "create" ? "Add product" : `Edit ${activeProduct?.name}`}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {formError && <div className="error-banner"><p>{formError}</p></div>}

            <FormField label="Name" htmlFor="name">
              <input id="name" value={formValues.name} onChange={handleFieldChange("name")} required />
            </FormField>

            <FormField label="SKU" htmlFor="sku">
              <input id="sku" value={formValues.sku} onChange={handleFieldChange("sku")} disabled={modalMode === "edit"} required />
            </FormField>

            <FormField label="Category" htmlFor="category">
              <input id="category" value={formValues.category} onChange={handleFieldChange("category")} required />
            </FormField>

            <FormField label="Purchase price" htmlFor="purchasePrice">
              <input id="purchasePrice" type="number" min="0" value={formValues.purchasePrice} onChange={handleFieldChange("purchasePrice")} required />
            </FormField>

            <FormField label="Selling price" htmlFor="sellingPrice">
              <input id="sellingPrice" type="number" min="0" value={formValues.sellingPrice} onChange={handleFieldChange("sellingPrice")} required />
            </FormField>

            <FormField label="Unit price" htmlFor="unitPrice">
              <input id="unitPrice" type="number" min="0" value={formValues.unitPrice} onChange={handleFieldChange("unitPrice")} disabled={modalMode === "edit"} required />
            </FormField>

            <FormField label="Quantity" htmlFor="quantity">
              <input id="quantity" type="number" min="0" value={formValues.quantity} onChange={handleFieldChange("quantity")} required />
            </FormField>

            <FormField label="Low stock threshold" htmlFor="lowStockThreshold">
              <input id="lowStockThreshold" type="number" min="0" value={formValues.lowStockThreshold} onChange={handleFieldChange("lowStockThreshold")} required />
            </FormField>

            <FormField label="Description" htmlFor="description">
              <textarea id="description" rows={3} value={formValues.description} onChange={handleFieldChange("description")} required />
            </FormField>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete product"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
};

export default Products;