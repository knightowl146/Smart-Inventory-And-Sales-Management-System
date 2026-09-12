import { useEffect, useState } from "react";
import { getSupplierPerformance } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const SupplierAnalyticsTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getSupplierPerformance({ limit: 10 });
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading supplier analytics…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const columns = [
    { key: "supplierName", header: "Supplier" },
    { key: "totalPurchases", header: "Orders", align: "right" },
    { key: "totalQuantityPurchased", header: "Units Supplied", align: "right" },
    { key: "totalPurchaseValue", header: "Total Value", align: "right", render: (row) => row.totalPurchaseValue.toFixed(2) },
    { key: "averagePurchaseValue", header: "Avg. Order Value", align: "right", render: (row) => row.averagePurchaseValue.toFixed(2) },
    {
      key: "lastPurchaseDate",
      header: "Last Purchase",
      render: (row) => (row.lastPurchaseDate ? new Date(row.lastPurchaseDate).toLocaleDateString() : "—"),
    },
  ];

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Suppliers" value={data.summary.totalSuppliers} />
        <StatCard label="Purchase transactions" value={data.summary.totalPurchaseTransactions} />
        <StatCard label="Units purchased" value={data.summary.totalQuantityPurchased} />
        <StatCard label="Total purchase value" value={data.summary.totalPurchaseValue.toFixed(2)} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Supplier performance</h2>
        <DataTable
          columns={columns}
          rows={data.suppliers}
          rowKey={(row) => row.supplierId}
          emptyMessage="No purchases recorded yet."
        />
      </div>
    </div>
  );
};

export default SupplierAnalyticsTab;