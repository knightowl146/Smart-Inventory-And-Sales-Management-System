import { useEffect, useState } from "react";
import { getSupplierReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const SupplierReportTab = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getSupplierReport(params);
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

  if (loading) return <Spinner label="Loading supplier report…" />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;

  const columns = [
    { key: "supplierName", header: "Supplier" },
    { key: "totalPurchases", header: "Orders", align: "right" },
    { key: "totalQuantityPurchased", header: "Units", align: "right" },
    { key: "totalPurchaseValue", header: "Total Value", align: "right", render: (row) => row.totalPurchaseValue.toFixed(2) },
    { key: "averagePurchaseValue", header: "Avg. Order", align: "right", render: (row) => row.averagePurchaseValue.toFixed(2) },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={load} />
      </div>

      <div className="stat-grid">
        <StatCard label="Suppliers" value={report.summary.totalSuppliers} />
        <StatCard label="Transactions" value={report.summary.totalTransactions} />
        <StatCard label="Units purchased" value={report.summary.totalQuantityPurchased} />
        <StatCard label="Total purchase value" value={report.summary.totalPurchaseValue.toFixed(2)} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Supplier performance</h2>
        <DataTable columns={columns} rows={report.supplierPerformance} rowKey={(row) => row.supplierId} emptyMessage="No purchases in this period." />
      </div>
    </div>
  );
};

export default SupplierReportTab;