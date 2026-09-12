import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getPurchaseAnalytics, getPurchasesByCategory } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import CategoryBarChart from "../../components/CategoryBarChart";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import EmptyState from "../../components/EmptyState";

const formatDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const PurchaseAnalyticsTab = () => {
  const [summary, setSummary] = useState(null);
  const [byCategory, setByCategory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, categoryRes] = await Promise.all([
        getPurchaseAnalytics(),
        getPurchasesByCategory(),
      ]);
      setSummary(summaryRes.data.data);
      setByCategory(categoryRes.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading purchase analytics…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const chartData = [...summary.purchaseOverTime]
    .reverse()
    .map((point) => ({ date: formatDate(point.date), spend: point.totalPurchaseCost }));

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total units purchased" value={summary.totalUnitsPurchased} />
        <StatCard label="Total purchase cost" value={summary.totalPurchaseCost.toFixed(2)} />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Purchase spend over time</h2>
          {chartData.length === 0 ? (
            <EmptyState message="No purchases recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e1e3df" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                <Tooltip />
                <Line type="monotone" dataKey="spend" stroke="#2c4a7c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2 className="panel__title">Purchase cost by category</h2>
          {byCategory.length === 0 ? (
            <EmptyState message="No category data yet." />
          ) : (
            <CategoryBarChart data={byCategory} dataKey="purchaseCost" color="#2c4a7c" />
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseAnalyticsTab;