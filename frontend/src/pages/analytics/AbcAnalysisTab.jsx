import { useEffect, useState } from "react";
import { getABCAnalysis } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const classTone = { A: "healthy", B: "info", C: "warning" };

const AbcAnalysisTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getABCAnalysis();
      setData(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading ABC analysis…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const columns = [
    { key: "name", header: "Product" },
    { key: "category", header: "Category" },
    { key: "quantity", header: "Stock", align: "right" },
    { key: "inventoryValue", header: "Inventory Value", align: "right" },
    { key: "cumulativePercentage", header: "Cumulative %", align: "right", render: (row) => `${row.cumulativePercentage}%` },
    {
      key: "classification",
      header: "Class",
      render: (row) => (
        <span className={`badge badge--${classTone[row.classification]}`}>{row.classification}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total inventory value" value={data.totalInventoryValue.toFixed(2)} />
        <StatCard label="Class A products" value={data.summary.A} />
        <StatCard label="Class B products" value={data.summary.B} />
        <StatCard label="Class C products" value={data.summary.C} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Products by value contribution</h2>
        <p className="field-hint" style={{ marginBottom: 16 }}>
          Class A products make up the top 70% of inventory value, Class B the next 20%, Class C the remaining 10%.
        </p>
        <DataTable
          columns={columns}
          rows={data.products}
          rowKey={(row) => row.productId}
          emptyMessage="No products yet."
        />
      </div>
    </div>
  );
};

export default AbcAnalysisTab;