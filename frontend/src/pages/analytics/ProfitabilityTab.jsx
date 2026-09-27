import { useEffect, useState } from "react";
import { getProfitLoss, getProfitLossByProduct } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import { formatMoney } from "../../utils/format";

const ProfitabilityTab = () => {
  const [summary, setSummary] = useState(null);
  const [byProduct, setByProduct] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, byProductRes] = await Promise.all([
        getProfitLoss(),
        getProfitLossByProduct(),
      ]);
      setSummary(summaryRes.data.data);
      setByProduct(byProductRes.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading profitability…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const columns = [
    { key: "product", header: "Product", render: (row) => row.product.name },
    { key: "revenue", header: "Revenue", align: "right", render: (row) => formatMoney(row.revenue) },
    { key: "costOfGoodsSold", header: "COGS", align: "right", render: (row) => formatMoney(row.costOfGoodsSold) },
    {
      key: "grossProfit",
      header: "Gross Profit",
      align: "right",
      render: (row) => (
        <span className={row.grossProfit < 0 ? "text-negative" : undefined}>{formatMoney(row.grossProfit)}</span>
      ),
    },
    { key: "profitMargin", header: "Margin", align: "right", render: (row) => `${row.profitMargin.toFixed(1)}%` },
  ];

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Revenue" value={formatMoney(summary.revenue, 0)} />
        <StatCard label="Cost of goods sold" value={formatMoney(summary.costOfGoodsSold, 0)} />
        <StatCard label="Gross profit" value={formatMoney(summary.grossProfit, 0)} />
        <StatCard label="Profit margin" value={`${summary.profitMargin.toFixed(1)}%`} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Profitability by product</h2>
        <DataTable
          columns={columns}
          rows={byProduct}
          rowKey={(row) => row.product._id}
          emptyMessage="No sales recorded yet."
        />
      </div>
    </div>
  );
};

export default ProfitabilityTab;