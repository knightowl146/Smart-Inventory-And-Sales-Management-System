import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getSalesAnalytics, getSalesByCategory, getTopSellingProducts } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import CategoryBarChart from "../../components/CategoryBarChart";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import EmptyState from "../../components/EmptyState";

const formatDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const SalesAnalyticsTab = () => {
  const [summary, setSummary] = useState(null);
  const [byCategory, setByCategory] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, categoryRes, topRes] = await Promise.all([
        getSalesAnalytics(),
        getSalesByCategory(),
        getTopSellingProducts({ limit: 5 }),
      ]);
      setSummary(summaryRes.data.data);
      setByCategory(categoryRes.data.data);
      setTopProducts(topRes.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading sales analytics…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const chartData = [...summary.salesOverTime]
    .reverse()
    .map((point) => ({ date: formatDate(point.date), revenue: point.revenue }));

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total units sold" value={summary.totalUnitsSold} />
        <StatCard label="Total revenue" value={summary.totalRevenue.toFixed(2)} />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Revenue over time</h2>
          {chartData.length === 0 ? (
            <EmptyState message="No sales recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e1e3df" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#2f6f4e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2 className="panel__title">Revenue by category</h2>
          {byCategory.length === 0 ? (
            <EmptyState message="No category data yet." />
          ) : (
            <CategoryBarChart data={byCategory} dataKey="revenue" />
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 className="panel__title">Top selling products</h2>
        {topProducts.length === 0 ? (
          <EmptyState message="No sales recorded yet." />
        ) : (
          <ul className="simple-list">
            {topProducts.map((item) => (
              <li key={item.product._id}>
                <span>{item.product.name}</span>
                <span className="field-hint">{item.quantitySold} units · {item.revenue.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SalesAnalyticsTab;