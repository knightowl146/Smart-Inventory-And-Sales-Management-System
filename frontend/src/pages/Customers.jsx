import { useEffect, useMemo, useState } from "react";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from "../api/customers";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import FormField from "../components/FormField";
import Button from "../components/Button";

const emptyForm = { name: "", phone: "", email: "", address: "" };

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [modalMode, setModalMode] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getCustomers();
      setCustomers(res.data.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const visibleCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const term = search.trim().toLowerCase();
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const openCreateModal = () => {
    setModalMode("create");
    setActiveCustomer(null);
    setFormValues(emptyForm);
    setFormError(null);
  };

  const openEditModal = (customer) => {
    setModalMode("edit");
    setActiveCustomer(customer);
    setFormValues({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
    });
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveCustomer(null);
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
      phone: formValues.phone.trim(),
      email: formValues.email.trim() || undefined,
      address: formValues.address.trim() || undefined,
    };

    try {
      if (modalMode === "create") {
        await createCustomer(payload);
      } else {
        await updateCustomer(activeCustomer._id, payload);
      }

      closeModal();
      loadCustomers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      await deleteCustomer(deleteTarget._id);
      setDeleteTarget(null);
      loadCustomers();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
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
          aria-label="Filter customers by name, phone or email"
          placeholder="Filter by name, phone or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="primary" onClick={openCreateModal}>Add customer</Button>
      </div>

      <DataTable
        columns={columns}
        rows={visibleCustomers}
        rowKey={(row) => row._id}
        loading={loading}
        error={error}
        onRetry={loadCustomers}
        emptyMessage="No customers found."
      />

      {modalMode && (
        <Modal
          title={modalMode === "create" ? "Add customer" : `Edit ${activeCustomer?.name}`}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {formError && <div className="error-banner" role="alert"><p>{formError}</p></div>}

            <FormField label="Name" htmlFor="name">
              <input id="name" value={formValues.name} onChange={handleFieldChange("name")} required />
            </FormField>

            <FormField label="Phone" htmlFor="phone">
              <input id="phone" value={formValues.phone} onChange={handleFieldChange("phone")} required />
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
          title="Delete customer"
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

export default Customers;