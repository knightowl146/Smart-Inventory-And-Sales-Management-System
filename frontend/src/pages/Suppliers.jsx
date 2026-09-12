import { useEffect, useMemo, useState } from "react";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from "../api/suppliers";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import FormField from "../components/FormField";
import Button from "../components/Button";

const emptyForm = { name: "", phone: "", email: "", address: "" };

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [modalMode, setModalMode] = useState(null);
  const [activeSupplier, setActiveSupplier] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadSuppliers = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getSuppliers();
      setSuppliers(res.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const visibleSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const term = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name?.toLowerCase().includes(term) ||
        s.phone?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term)
    );
  }, [suppliers, search]);

  const openCreateModal = () => {
    setModalMode("create");
    setActiveSupplier(null);
    setFormValues(emptyForm);
    setFormError(null);
  };

  const openEditModal = (supplier) => {
    setModalMode("edit");
    setActiveSupplier(supplier);
    setFormValues({
      name: supplier.name ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
    });
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveSupplier(null);
    setFormError(null);
  };

  const handleFieldChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      name: formValues.name.trim(),
      phone: formValues.phone.trim() || undefined,
      email: formValues.email.trim() || undefined,
      address: formValues.address.trim() || undefined,
    };

    try {
      if (modalMode === "create") {
        await createSupplier(payload);
      } else {
        await updateSupplier(activeSupplier._id, payload);
      }

      closeModal();
      loadSuppliers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      await deleteSupplier(deleteTarget._id);
      setDeleteTarget(null);
      loadSuppliers();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone", render: (row) => row.phone || "—" },
    { key: "email", header: "Email", render: (row) => row.email || "—" },
    { key: "address", header: "Address", render: (row) => row.address || "—" },
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
        <input
          type="text"
          placeholder="Filter by name, phone or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="primary" onClick={openCreateModal}>Add supplier</Button>
      </div>

      <DataTable
        columns={columns}
        rows={visibleSuppliers}
        rowKey={(row) => row._id}
        loading={loading}
        error={error}
        onRetry={loadSuppliers}
        emptyMessage="No suppliers found."
      />

      {modalMode && (
        <Modal
          title={modalMode === "create" ? "Add supplier" : `Edit ${activeSupplier?.name}`}
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

            <FormField label="Phone" htmlFor="phone">
              <input id="phone" value={formValues.phone} onChange={handleFieldChange("phone")} />
            </FormField>

            <FormField label="Email" htmlFor="email">
              <input id="email" type="email" value={formValues.email} onChange={handleFieldChange("email")} />
            </FormField>

            <FormField label="Address" htmlFor="address">
              <textarea id="address" rows={2} value={formValues.address} onChange={handleFieldChange("address")} />
            </FormField>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete supplier"
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

export default Suppliers;