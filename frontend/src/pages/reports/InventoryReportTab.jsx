import { useEffect, useState } from "react";
import { getInventoryReport, exportInventoryReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import ExportButtons from "../../components/ExportButtons";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const InventoryReportTab = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getInventoryReport();
      setReport(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading inventory report…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const lowStockColumns = [
    { key: "name", header: "Product" },
    { key: "sku", header: "SKU" },
    { key: "currentStock", header: "Stock", align: "right" },
    { key: "lowStockThreshold", header: "Threshold", align: "right" },
    { key: "inventoryValue", header: "Value", align: "right", render: (row) => row.inventoryValue.toFixed(2) },
  ];

  const outOfStockColumns = [
    { key: "name", header: "Product" },
    { key: "sku", header: "SKU" },
    { key: "category", header: "Category" },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <span className="field-hint">Inventory report is a current snapshot (no date range).</span>
        <ExportButtons exportFn={exportInventoryReport} filenameBase="inventory-report" params={{}} />
      </div>

      <div className="stat-grid">
        <StatCard label="Total products" value={report.summary.totalProducts} />
        <StatCard label="Total quantity" value={report.summary.totalQuantity} />
        <StatCard label="Inventory value" value={report.summary.totalInventoryValue.toFixed(2)} />
        <StatCard label="Low stock" value={report.summary.lowStockCount} tone="warning" />
        <StatCard label="Out of stock" value={report.summary.outOfStockCount} tone="danger" />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Low stock products</h2>
          <DataTable columns={lowStockColumns} rows={report.lowStockProducts} rowKey={(row) => row.productId} emptyMessage="Nothing is low on stock." />
        </div>

        <div className="panel">
          <h2 className="panel__title">Out of stock products</h2>
          <DataTable columns={outOfStockColumns} rows={report.outOfStockProducts} rowKey={(row) => row.productId} emptyMessage="Nothing is out of stock." />
        </div>
      </div>
    </div>
  );
};

export default InventoryReportTab;