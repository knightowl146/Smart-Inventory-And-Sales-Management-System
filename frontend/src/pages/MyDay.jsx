import { useEffect, useState } from "react";
import { getMySummary } from "../api/auth";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

/**
 * The employee home screen.
 *
 * Backed by /api/me/summary rather than the owner dashboard endpoint: the
 * owner's dashboard reports revenue, margin and stock valuation, none of which
 * an employee is meant to see, and a purpose-built endpoint is safer than
 * trying to redact a rich one. See controllers/meController.js.
 */
const MyDay = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getMySummary()
      .then((response) => {
        if (!cancelled) setSummary(response.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Spinner label="Loading your day…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!summary) return <EmptyState message="Nothing to show yet." />;

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Good to see you, {summary.user.name}</h2>
      </div>

      <div className="stat-grid">
        <StatCard label="Units sold today" value={summary.today.unitsSold} />
        <StatCard label="Sales today" value={summary.today.transactions} />
        <StatCard label="Units sold, last 7 days" value={summary.last7Days.unitsSold} />
        <StatCard
          label="Products low on stock"
          value={summary.lowStockCount}
          tone={summary.lowStockCount > 0 ? "warning" : undefined}
        />
      </div>

      <div className="panel">
        <h3 className="panel__title">Your recent sales</h3>

        {summary.recentSales.length === 0 ? (
          <EmptyState message="You haven't recorded a sale yet." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.product}</td>
                    <td>{sale.sku || "—"}</td>
                    <td>{sale.customer || "Walk-in"}</td>
                    <td>{sale.quantity}</td>
                    <td>{new Date(sale.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default MyDay;
