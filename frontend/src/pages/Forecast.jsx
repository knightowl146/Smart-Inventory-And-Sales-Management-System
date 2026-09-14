import { useCallback, useEffect, useState } from "react";
import {
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getProducts } from "../api/products";
import { getProductForecast, getForecastAccuracy } from "../api/intelligence";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

const URGENCY_TONE = {
  OUT_OF_STOCK: "danger",
  URGENT: "danger",
  REORDER_NOW: "warning",
  REORDER_SOON: "warning",
};

const URGENCY_BADGE = {
  OUT_OF_STOCK: "danger",
  URGENT: "danger",
  REORDER_NOW: "warning",
  REORDER_SOON: "warning",
  HEALTHY: "healthy",
  NO_DEMAND: "info",
};

/**
 * Demand forecast for one product.
 *
 * The chart deliberately puts actual history and the forecast on one axis, with
 * the prediction interval drawn as a band. A forecast line on its own asks to be
 * believed; a forecast line next to the history it was fitted from, inside a
 * band that says how uncertain it is, can be judged.
 */
const Forecast = () => {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [horizon, setHorizon] = useState(30);

  useEffect(() => {
    getProducts({ limit: 100 })
      .then((response) => {
        const list = response.data.data ?? [];
        setProducts(list);
        if (list.length > 0) setSelected(list[0]._id);
      })
      .catch((err) => setError(err.message));

    getForecastAccuracy()
      .then((response) => setAccuracy(response.data.data))
      .catch(() => setAccuracy(null));
  }, []);

  const load = useCallback(async () => {
    if (!selected) return;

    setLoading(true);
    setError("");

    try {
      const response = await getProductForecast(selected, { horizon });
      setData(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selected, horizon]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = data
    ? [
        ...data.history.map((row) => ({ date: row.date, actual: row.actual })),
        ...data.forecast.points.map((point) => ({
          date: point.date,
          expected: point.expected,
          band: [point.lower, point.upper],
        })),
      ]
    : [];

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Demand forecast</h2>

        <div className="page-toolbar__controls">
          <select
            id="forecast-product"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {products.map((product) => (
              <option key={product._id} value={product._id}>
                {product.name}
              </option>
            ))}
          </select>

          <select
            id="forecast-horizon"
            value={horizon}
            onChange={(event) => setHorizon(Number(event.target.value))}
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {accuracy && accuracy.evaluated > 0 && (
        <div className="panel">
          <h3 className="panel__title">How accurate is this?</h3>
          <p className="field-hint">
            Measured by holding out the last {accuracy.holdoutDays} days from{" "}
            {accuracy.evaluated} products and forecasting them from the rest — so
            these are out-of-sample errors, not a description of the fit.
          </p>

          <div className="stat-grid">
            <StatCard label="Mean absolute error" value={`${accuracy.overall.mae} units/day`} />
            <StatCard label="Naive baseline" value={`${accuracy.baselines.naive.mae} units/day`} />
            <StatCard
              label="Seasonal baseline"
              value={`${accuracy.baselines.seasonalNaive.mae} units/day`}
            />
            <StatCard
              label="Products where the model wins"
              value={`${accuracy.beatsBaselinePercent}%`}
              tone={accuracy.beatsBaselinePercent >= 50 ? undefined : "warning"}
            />
          </div>
        </div>
      )}

      {loading && <Spinner label="Forecasting…" />}

      {!loading && data && (
        <>
          <div className="stat-grid">
            <StatCard label="In stock" value={data.product.currentStock} />
            <StatCard
              label={`Expected demand, ${horizon} days`}
              value={Math.round(data.forecast.totalExpected)}
            />
            <StatCard label="Reorder point" value={data.reorder.reorderPoint} />
            <StatCard
              label="Days of cover"
              value={data.reorder.daysOfCover ?? "—"}
              tone={URGENCY_TONE[data.reorder.urgency]}
            />
          </div>

          <div className="panel">
            <h3 className="panel__title">
              {data.product.name}{" "}
              <span className={`badge badge--${URGENCY_BADGE[data.reorder.urgency]}`}>
                {data.reorder.urgency.replace(/_/g, " ").toLowerCase()}
              </span>
            </h3>

            <p>{data.reorder.explanation}</p>

            {data.forecast.warning && (
              <p className="field-hint">⚠ {data.forecast.warning}</p>
            )}

            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e3df" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area
                    dataKey="band"
                    name="Prediction interval"
                    stroke="none"
                    fill="#2f6f4e"
                    fillOpacity={0.12}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="#171b1f"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="expected"
                    name="Forecast"
                    stroke="#2f6f4e"
                    strokeDasharray="4 3"
                    dot={false}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <h3 className="panel__title">How this number was reached</h3>

            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  <tr>
                    <td>Method</td>
                    <td>{data.forecast.method}</td>
                  </tr>
                  <tr>
                    <td>Days of history used</td>
                    <td>{data.forecast.observations}</td>
                  </tr>
                  <tr>
                    <td>Average daily demand</td>
                    <td>{data.forecast.dailyMean}</td>
                  </tr>
                  <tr>
                    <td>Demand variability (std dev)</td>
                    <td>{data.forecast.dailyStdDev}</td>
                  </tr>
                  <tr>
                    <td>Supplier lead time</td>
                    <td>
                      {data.reorder.leadTime.leadTimeDays} days ({data.reorder.leadTime.source})
                    </td>
                  </tr>
                  <tr>
                    <td>Safety stock</td>
                    <td>{data.reorder.safetyStock}</td>
                  </tr>
                  <tr>
                    <td>Reorder point</td>
                    <td>
                      {data.reorder.leadTimeDemand} (lead-time demand) +{" "}
                      {data.reorder.safetyStock} (safety stock) = {data.reorder.reorderPoint}
                    </td>
                  </tr>
                  <tr>
                    <td>Suggested order quantity</td>
                    <td>{data.reorder.suggestedQuantity}</td>
                  </tr>
                  {data.accuracy && (
                    <tr>
                      <td>This product&apos;s backtest error</td>
                      <td>
                        {data.accuracy.model.mae} units/day, versus{" "}
                        {data.accuracy.baselines.naive.mae} for the naive baseline
                        {data.accuracy.beatsBaseline ? " — model wins" : " — baseline wins"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !data && !error && <EmptyState message="Pick a product to forecast." />}
    </>
  );
};

export default Forecast;
