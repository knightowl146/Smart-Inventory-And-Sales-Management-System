import { useCallback, useEffect, useState } from "react";
import * as usersApi from "../api/users";
import { useAuth } from "../context/authContext";
import Button from "../components/Button";
import Modal from "../components/Modal";
import FormField from "../components/FormField";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

const emptyForm = { name: "", email: "", password: "", role: "employee" };

const Staff = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await usersApi.getUsers();
      setUsers(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError("");
    setBusy(true);

    try {
      await usersApi.createUser(form);
      setForm(emptyForm);
      setCreating(false);
      setNotice(`Account created for ${form.email}.`);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (target) => {
    setNotice("");

    try {
      await usersApi.updateUser(target.id, { isActive: !target.isActive });
      setNotice(
        target.isActive
          ? `${target.name} has been deactivated and signed out everywhere.`
          : `${target.name} can sign in again.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRole = async (target, role) => {
    setNotice("");

    try {
      await usersApi.updateUser(target.id, { role });
      setNotice(`${target.name} is now ${role === "owner" ? "an owner" : "an employee"}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReset = async () => {
    setBusy(true);

    try {
      await usersApi.resetUserPassword(resetting.id, newPassword);
      setNotice(`Password reset for ${resetting.name}.`);
      setResetting(null);
      setNewPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);

    try {
      await usersApi.deleteUser(deleting.id);
      setNotice(`${deleting.name} has been removed.`);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading staff…" />;

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Staff accounts</h2>
        <Button onClick={() => setCreating(true)}>Add account</Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {notice && <div className="success-banner">{notice}</div>}

      <div className="panel">
        <p className="field-hint">
          There is no public sign-up. Every account here was created by an owner.
          Deactivating someone ends their session immediately rather than when
          their token expires.
        </p>

        {users.length === 0 ? (
          <EmptyState message="No accounts yet." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last signed in</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((person) => {
                  const isSelf = person.id === currentUser?.id;

                  return (
                    <tr key={person.id}>
                      <td>
                        {person.name}
                        {isSelf && <span className="badge badge--info"> you</span>}
                      </td>
                      <td>{person.email}</td>
                      <td>
                        <select
                          id={`role-${person.id}`}
                          value={person.role}
                          disabled={isSelf}
                          onChange={(event) => changeRole(person, event.target.value)}
                        >
                          <option value="employee">Employee</option>
                          <option value="owner">Owner</option>
                        </select>
                      </td>
                      <td>
                        <span className={`badge badge--${person.isActive ? "healthy" : "danger"}`}>
                          {person.isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td>
                        {person.lastLoginAt
                          ? new Date(person.lastLoginAt).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="row-actions">
                        <Button variant="secondary" onClick={() => setResetting(person)}>
                          Reset password
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isSelf}
                          onClick={() => toggleActive(person)}
                        >
                          {person.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isSelf}
                          onClick={() => setDeleting(person)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <Modal
          title="Add a staff account"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </>
          }
        >
          {formError && <div className="error-banner">{formError}</div>}

          <form className="form-grid" onSubmit={handleCreate}>
            <FormField label="Name" htmlFor="new-user-name">
              <input
                id="new-user-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </FormField>

            <FormField label="Email" htmlFor="new-user-email">
              <input
                id="new-user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </FormField>

            <FormField label="Temporary password" htmlFor="new-user-password">
              <input
                id="new-user-password"
                type="text"
                minLength={8}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
            </FormField>

            <FormField label="Role" htmlFor="new-user-role">
              <select
                id="new-user-role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                <option value="employee">Employee — sell and read only</option>
                <option value="owner">Owner — full access</option>
              </select>
            </FormField>
          </form>
        </Modal>
      )}

      {resetting && (
        <Modal
          title={`Reset password for ${resetting.name}`}
          onClose={() => setResetting(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetting(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleReset} disabled={busy || newPassword.length < 8}>
                {busy ? "Resetting…" : "Reset password"}
              </Button>
            </>
          }
        >
          <FormField label="New password (at least 8 characters)" htmlFor="reset-password">
            <input
              id="reset-password"
              type="text"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </FormField>
          <p className="field-hint">
            They will be signed out of every device and will need the new password
            to get back in.
          </p>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="The account is removed permanently. Their past sales stay in the ledger and in the audit log."
          confirmLabel="Delete account"
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
};

export default Staff;
