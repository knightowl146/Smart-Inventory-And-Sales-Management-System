import { useEffect, useState } from "react";
import { getInventoryByCategory, getInventoryTurnover, getDeadStock } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import CategoryBarChart from "../../components/CategoryBarChart";
import DataTable from "../../components/DataTable";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import EmptyState from "../../components/EmptyState";
import { formatMoney } from "../../utils/format";

const InventoryAnalyticsTab = () => {
  const [byCategory, setByCategory] = useState([]);
  const [turnover, setTurnover] = useState(null);
  const [deadStock, setDeadStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [categoryRes, turnoverRes, deadStockRes] = await Promise.all([
        getInventoryByCategory(),
        getInventoryTurnover({ limit: 8 }),
        getDeadStock({ limit: 8 }),
      ]);
      setByCategory(categoryRes.data.data);
      setTurnover(turnoverRes.data);
      setDeadStock(deadStockRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading inventory analytics…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const turnoverColumns = [
    { key: "productName", header: "Product" },
    { key: "category", header: "Category" },
    { key: "quantitySold", header: "Units Sold", align: "right" },
    { key: "costOfGoodsSold", header: "COGS", align: "right", render: (row) => formatMoney(row.costOfGoodsSold) },
    { key: "turnoverRatio", header: "Turnover Ratio", align: "right" },
  ];

  const deadStockColumns = [
    { key: "productName", header: "Product" },
    { key: "category", header: "Category" },
    { key: "quantity", header: "Stock", align: "right" },
    { key: "inventoryValue", header: "Value Tied Up", align: "right", render: (row) => formatMoney(row.inventoryValue) },
    {
      key: "daysSinceLastSale",
      header: "Days Since Last Sale",
      align: "right",
      render: (row) => row.daysSinceLastSale ?? "Never sold",
    },
  ];

  return (
    <div>
      <div className="panel">
        <h2 className="panel__title">Inventory value by category</h2>
        {byCategory.length === 0 ? (
          <EmptyState message="No category data yet." />
        ) : (
          <CategoryBarChart data={byCategory} dataKey="inventoryValue" color="#6b4fa0" />
        )}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 className="panel__title">Inventory turnover</h2>
        <div className="stat-grid">
          <StatCard label="Total COGS" value={formatMoney(turnover.summary.totalCOGS, 0)} />
          <StatCard label="Total inventory value" value={formatMoney(turnover.summary.totalInventoryValue, 0)} />
          <StatCard label="Turnover ratio" value={turnover.summary.inventoryTurnoverRatio} />
        </div>
        <DataTable
          columns={turnoverColumns}
          rows={turnover.products}
          rowKey={(row) => row.productId}
          emptyMessage="No sales data to calculate turnover."
        />
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 className="panel__title">Dead stock (no sales in 30 days)</h2>
        <div className="stat-grid">
          <StatCard label="Dead stock products" value={deadStock.summary.deadStockProducts} tone="warning" />
          <StatCard label="Units tied up" value={deadStock.summary.deadStockQuantity} tone="warning" />
          <StatCard label="Value tied up" value={formatMoney(deadStock.summary.deadStockValue, 0)} tone="warning" />
        </div>
        <DataTable
          columns={deadStockColumns}
          rows={deadStock.products}
          rowKey={(row) => row.productId}
          emptyMessage="No dead stock — everything has recent sales."
        />
      </div>
    </div>
  );
};

export default InventoryAnalyticsTab;