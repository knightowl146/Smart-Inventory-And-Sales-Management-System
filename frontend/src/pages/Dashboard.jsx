import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getDashboardSummary } from "../api/analytics";
import StatCard from "../components/StatCard";
import GrowthBadge from "../components/GrowthBadge";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

const formatDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getDashboardSummary();
      setSummary(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorBanner message={error} onRetry={loadSummary} />;
  if (!summary) return <EmptyState message="No dashboard data available." />;

  const { overview, financial, salesVsPurchases, trends, lowStockProducts, topSellingProducts } = summary;

  const chartData = trends.sales.map((point) => ({
    date: formatDate(point.date),
    revenue: point.revenue,
  }));

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total products" value={overview.totalProducts} />
        <StatCard label="Total customers" value={overview.totalCustomers} />
        <StatCard label="Units in stock" value={overview.totalStock} />
        <StatCard label="Inventory value" value={overview.inventoryValue.toFixed(2)} />
        <StatCard label="Low stock" value={overview.lowStockCount} tone="warning" />
        <StatCard label="Out of stock" value={overview.outOfStockCount} tone="danger" />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Financials (last 30 days)</h2>
          <div className="financial-summary">
            <div>
              <p className="field-hint">Revenue</p>
              <p className="financial-summary__value">{financial.revenue.toFixed(2)}</p>
            </div>
            <div>
              <p className="field-hint">Cost of goods sold</p>
              <p className="financial-summary__value">{financial.costOfGoodsSold.toFixed(2)}</p>
            </div>
            <div>
              <p className="field-hint">Gross profit</p>
              <p className="financial-summary__value">{financial.profit.toFixed(2)}</p>
            </div>
            <div>
              <p className="field-hint">Margin</p>
              <p className="financial-summary__value">{financial.profitMargin.toFixed(1)}%</p>
            </div>
          </div>
          <GrowthBadge value={financial.growth} />
        </div>

        <div className="panel">
          <h2 className="panel__title">Sales vs purchases (last 30 days)</h2>
          <div className="financial-summary">
            <div>
              <p className="field-hint">Sales</p>
              <p className="financial-summary__value">{salesVsPurchases.sales.toFixed(2)}</p>
            </div>
            <div>
              <p className="field-hint">Purchases</p>
              <p className="financial-summary__value">{salesVsPurchases.purchases.toFixed(2)}</p>
            </div>
            <div>
              <p className="field-hint">Difference</p>
              <p className="financial-summary__value">{salesVsPurchases.difference.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 className="panel__title">Sales trend (last 30 days)</h2>
        {chartData.length === 0 ? (
          <EmptyState message="No sales recorded in the last 30 days." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
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

      <div className="dashboard-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2 className="panel__title">Needs attention</h2>
          {lowStockProducts.length === 0 ? (
            <EmptyState message="Nothing is low on stock right now." />
          ) : (
            <ul className="simple-list">
              {lowStockProducts.map((product) => (
                <li key={product._id}>
                  <span>{product.name}</span>
                  <span className="badge badge--warning">
                    {product.quantity} / {product.lowStockThreshold}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2 className="panel__title">Top selling products</h2>
          {topSellingProducts.length === 0 ? (
            <EmptyState message="No sales in the last 30 days." />
          ) : (
            <ul className="simple-list">
              {topSellingProducts.map((product) => (
                <li key={product.productId}>
                  <span>{product.name}</span>
                  <span className="field-hint">{product.quantitySold} units · {product.revenue.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;