import { useEffect, useState } from "react";
import { getPurchaseReport, exportPurchaseReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import ExportButtons from "../../components/ExportButtons";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const PurchaseReportTab = () => {
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (params = filters) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getPurchaseReport(params);
      setReport(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (params) => {
    setFilters(params);
    load(params);
  };

  if (loading) return <Spinner label="Loading purchase report…" />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;

  const productColumns = [
    { key: "productName", header: "Product" },
    { key: "category", header: "Category" },
    { key: "unitsPurchased", header: "Units", align: "right" },
    { key: "purchaseCost", header: "Cost", align: "right", render: (row) => row.purchaseCost.toFixed(2) },
  ];

  const supplierColumns = [
    { key: "supplierName", header: "Supplier" },
    { key: "unitsPurchased", header: "Units", align: "right" },
    { key: "totalPurchaseCost", header: "Total Cost", align: "right", render: (row) => row.totalPurchaseCost.toFixed(2) },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={handleApply} />
        <ExportButtons exportFn={exportPurchaseReport} filenameBase="purchase-report" params={filters} />
      </div>

      <div className="stat-grid">
        <StatCard label="Transactions" value={report.summary.totalTransactions} />
        <StatCard label="Units purchased" value={report.summary.totalUnitsPurchased} />
        <StatCard label="Total cost" value={report.summary.totalPurchaseCost.toFixed(2)} />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Purchases by product</h2>
          <DataTable columns={productColumns} rows={report.purchasesByProduct} rowKey={(row) => row.productId} emptyMessage="No purchases in this period." />
        </div>

        <div className="panel">
          <h2 className="panel__title">Top suppliers</h2>
          <DataTable columns={supplierColumns} rows={report.topSuppliers} rowKey={(row) => row.supplierId} emptyMessage="No purchases in this period." />
        </div>
      </div>
    </div>
  );
};

export default PurchaseReportTab;