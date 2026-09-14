import { useCallback, useEffect, useState } from "react";
import { getAuditLog } from "../api/users";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";

const OUTCOMES = [
  { value: "", label: "All outcomes" },
  { value: "success", label: "Succeeded" },
  { value: "failure", label: "Failed" },
];

const describe = (entry) => {
  const parts = [];

  if (entry.entity?.type) parts.push(entry.entity.type);
  if (entry.meta?.reason) parts.push(`reason: ${entry.meta.reason}`);
  if (entry.changes?.after) {
    const keys = Object.keys(entry.changes.after);
    if (keys.length > 0) parts.push(keys.join(", "));
  }

  return parts.join(" · ") || "—";
};

const ActivityLog = () => {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getAuditLog({ page, limit: 25, ...(outcome && { outcome }) });
      setEntries(response.data.data);
      setPagination(response.data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, outcome]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Activity log</h2>
        <select
          id="audit-outcome"
          value={outcome}
          onChange={(event) => {
            setPage(1);
            setOutcome(event.target.value);
          }}
        >
          {OUTCOMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="panel">
        <p className="field-hint">
          Every sign-in and every change to stock, products, customers,
          suppliers and staff accounts, with the person who did it.
        </p>

        {loading ? (
          <Spinner label="Loading activity…" />
        ) : entries.length === 0 ? (
          <EmptyState message="Nothing recorded yet." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Outcome</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry._id}>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>
                        {entry.actor?.email || "anonymous"}
                        <span className="field-hint"> {entry.actor?.role}</span>
                      </td>
                      <td>
                        <code>{entry.action}</code>
                      </td>
                      <td>
                        <span
                          className={`badge badge--${
                            entry.outcome === "success" ? "healthy" : "danger"
                          }`}
                        >
                          {entry.outcome}
                        </span>
                      </td>
                      <td>{describe(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && (
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </>
  );
};

export default ActivityLog;
