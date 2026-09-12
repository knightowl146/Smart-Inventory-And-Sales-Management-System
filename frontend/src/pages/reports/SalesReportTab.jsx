import { useEffect, useState } from "react";
import { getSalesReport, exportSalesReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import ExportButtons from "../../components/ExportButtons";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const SalesReportTab = () => {
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (params = filters) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getSalesReport(params);
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

  if (loading) return <Spinner label="Loading sales report…" />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;

  const productColumns = [
    { key: "productName", header: "Product" },
    { key: "category", header: "Category" },
    { key: "unitsSold", header: "Units Sold", align: "right" },
    { key: "revenue", header: "Revenue", align: "right", render: (row) => row.revenue.toFixed(2) },
  ];

  const customerColumns = [
    { key: "customerName", header: "Customer" },
    { key: "unitsPurchased", header: "Units", align: "right" },
    { key: "totalSpent", header: "Total Spent", align: "right", render: (row) => row.totalSpent.toFixed(2) },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={handleApply} />
        <ExportButtons exportFn={exportSalesReport} filenameBase="sales-report" params={filters} />
      </div>

      <div className="stat-grid">
        <StatCard label="Transactions" value={report.summary.totalTransactions} />
        <StatCard label="Units sold" value={report.summary.totalUnitsSold} />
        <StatCard label="Total revenue" value={report.summary.totalRevenue.toFixed(2)} />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel__title">Sales by product</h2>
          <DataTable columns={productColumns} rows={report.salesByProduct} rowKey={(row) => row.productId} emptyMessage="No sales in this period." />
        </div>

        <div className="panel">
          <h2 className="panel__title">Top customers</h2>
          <DataTable columns={customerColumns} rows={report.topCustomers} rowKey={(row) => row.customerId} emptyMessage="No sales in this period." />
        </div>
      </div>
    </div>
  );
};

export default SalesReportTab;