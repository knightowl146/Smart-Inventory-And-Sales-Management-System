import { useCallback, useEffect, useState } from "react";
import { getReorderPlan } from "../api/intelligence";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

const BADGE = {
  OUT_OF_STOCK: "danger",
  URGENT: "danger",
  REORDER_NOW: "warning",
  REORDER_SOON: "warning",
  HEALTHY: "healthy",
  NO_DEMAND: "info",
};

const SERVICE_LEVELS = [
  { value: 0.9, label: "90% — leaner stock, more stockouts" },
  { value: 0.95, label: "95% — the usual retail default" },
  { value: 0.99, label: "99% — rarely out, more capital tied up" },
];

/**
 * What to buy this week.
 *
 * The service-level control is the interesting part of this page: it makes the
 * tradeoff explicit rather than burying it. Raising it widens every safety
 * stock and the total cost goes up on screen, which is a more honest way to
 * present an inventory policy than a single "recommended quantity" with no
 * indication of what it is optimising for.
 */
const ReorderPlan = () => {
  const [plan, setPlan] = useState(null);
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [onlyActionable, setOnlyActionable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getReorderPlan({ serviceLevel });
      setPlan(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serviceLevel]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = plan
    ? plan.rows.filter((row) => (onlyActionable ? row.suggestedQuantity > 0 : true))
    : [];

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Reorder plan</h2>

        <div className="page-toolbar__controls">
          <select
            id="service-level"
            value={serviceLevel}
            onChange={(event) => setServiceLevel(Number(event.target.value))}
          >
            {SERVICE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>

          <label className="inline-check" htmlFor="only-actionable">
            <input
              id="only-actionable"
              type="checkbox"
              checked={onlyActionable}
              onChange={(event) => setOnlyActionable(event.target.checked)}
            />
            Only what needs ordering
          </label>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading && <Spinner label="Working out what to order…" />}

      {!loading && plan && (
        <>
          <div className="stat-grid">
            <StatCard label="Products reviewed" value={plan.summary.productsReviewed} />
            <StatCard
              label="Need ordering"
              value={plan.summary.needingOrder}
              tone={plan.summary.needingOrder > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Out of stock"
              value={plan.summary.outOfStock}
              tone={plan.summary.outOfStock > 0 ? "danger" : undefined}
            />
            <StatCard label="Estimated cost" value={plan.summary.estimatedTotalCost} />
          </div>

          <div className="panel">
            <p className="field-hint">
              Reorder points assume a {plan.assumptions.leadTimeDays}-day lead time at a{" "}
              {Math.round(plan.assumptions.serviceLevel * 100)}% service level, from{" "}
              {plan.assumptions.lookbackDays} days of demand. {plan.assumptions.note}
            </p>

            {rows.length === 0 ? (
              <EmptyState message="Nothing needs ordering right now." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Status</th>
                      <th>In stock</th>
                      <th>Reorder point</th>
                      <th>Days of cover</th>
                      <th>Order</th>
                      <th>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.product.id}>
                        <td>
                          {row.product.name}
                          <span className="field-hint"> {row.product.sku}</span>
                        </td>
                        <td>
                          <span className={`badge badge--${BADGE[row.urgency]}`}>
                            {row.urgency.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </td>
                        <td>{row.product.currentStock}</td>
                        <td>
                          {row.reorderPoint}
                          <span className="field-hint"> (+{row.safetyStock} safety)</span>
                        </td>
                        <td>{row.daysOfCover ?? "—"}</td>
                        <td>
                          <strong>{row.suggestedQuantity}</strong>
                        </td>
                        <td>{row.estimatedCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default ReorderPlan;
