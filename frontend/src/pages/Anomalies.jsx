import { useCallback, useEffect, useState } from "react";
import { getAnomalies } from "../api/intelligence";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

const SEVERITY_BADGE = { critical: "danger", high: "warning", medium: "info" };

const TYPE_LABEL = {
  volume: "Unusual volume",
  discount: "Discounting",
  actor: "Staff pattern",
};

/**
 * The anomaly feed.
 *
 * Every finding shows the numbers that triggered it next to the sentence
 * describing it. That ordering is deliberate — the statistics are the finding,
 * the sentence is a convenience, and putting the prose first would invite
 * people to act on the model's wording rather than the evidence.
 *
 * The copy is also careful not to accuse. A discount may have been authorised;
 * a spike may have been a bulk order. These are things to look at.
 */
const Anomalies = () => {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getAnomalies({ days });
      setData(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const describe = (anomaly) => {
    if (anomaly.type === "volume") {
      return `${anomaly.product?.name ?? "A product"} moved ${anomaly.observed} units on ${anomaly.date}, against a typical ${anomaly.expected}.`;
    }

    if (anomaly.type === "discount") {
      return `${anomaly.product?.name ?? "A product"} sold at ${anomaly.soldAt} against a list price of ${anomaly.listPrice} — ${anomaly.discountPercent}% off, ${anomaly.discountValue} in total.`;
    }

    return `${anomaly.actor?.name ?? "An account"} shows a ${anomaly.metricLabel} of ${anomaly.observed}, against ${anomaly.peerAverage} for colleagues.`;
  };

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Anomaly watch</h2>

        <select id="anomaly-window" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading && <Spinner label="Looking for outliers…" />}

      {!loading && data && (
        <>
          <div className="stat-grid">
            <StatCard label="Findings" value={data.summary.total} />
            <StatCard
              label="Critical"
              value={data.summary.critical}
              tone={data.summary.critical > 0 ? "danger" : undefined}
            />
            <StatCard label="Discounting" value={data.summary.byType.discount} />
            <StatCard label="Volume" value={data.summary.byType.volume} />
          </div>

          <div className="panel">
            <p className="field-hint">
              These are statistical outliers, not accusations. A discount may
              have been authorised and a spike may have been a bulk order — each
              one is something worth a look, nothing more.
            </p>

            {data.anomalies.length === 0 ? (
              <EmptyState message="Nothing unusual in this period." />
            ) : (
              <ul className="anomaly-list">
                {data.anomalies.map((anomaly, index) => (
                  <li className="anomaly" key={index}>
                    <div className="anomaly__head">
                      <span className={`badge badge--${SEVERITY_BADGE[anomaly.severity]}`}>
                        {anomaly.severity}
                      </span>
                      <span className="anomaly__type">{TYPE_LABEL[anomaly.type]}</span>
                      {anomaly.date && <span className="field-hint">{anomaly.date}</span>}
                    </div>

                    {/* The evidence first. */}
                    <p className="anomaly__facts">{describe(anomaly)}</p>

                    {anomaly.narrative && (
                      <div className="anomaly__narrative">
                        <p>{anomaly.narrative.explanation}</p>
                        <p className="anomaly__check">
                          <strong>Worth checking:</strong> {anomaly.narrative.suggestedCheck}
                        </p>
                      </div>
                    )}

                    {anomaly.actor && anomaly.type === "discount" && (
                      <p className="field-hint">Recorded by {anomaly.actor.name}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.staffComparison.length > 0 && (
            <div className="panel">
              <h3 className="panel__title">Staff comparison</h3>
              <p className="field-hint">
                Only accounts with enough sales to compare meaningfully are shown.
              </p>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Sales</th>
                      <th>Active days</th>
                      <th>Sales / day</th>
                      <th>Discounted</th>
                      <th>Avg discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staffComparison.map((actor) => (
                      <tr key={actor.id}>
                        <td>{actor.name}</td>
                        <td>{actor.sales}</td>
                        <td>{actor.activeDays}</td>
                        <td>{actor.salesPerActiveDay}</td>
                        <td>{actor.discountRate}%</td>
                        <td>{actor.averageDiscountPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default Anomalies;
