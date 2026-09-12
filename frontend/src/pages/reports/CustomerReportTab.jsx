import { useEffect, useState } from "react";
import { getCustomerReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const CustomerReportTab = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getCustomerReport(params);
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

  if (loading) return <Spinner label="Loading customer report…" />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;

  const columns = [
    { key: "customerName", header: "Customer" },
    { key: "totalPurchases", header: "Orders", align: "right" },
    { key: "totalQuantityPurchased", header: "Units", align: "right" },
    { key: "totalSpent", header: "Total Spent", align: "right", render: (row) => row.totalSpent.toFixed(2) },
    { key: "averagePurchaseValue", header: "Avg. Order", align: "right", render: (row) => row.averagePurchaseValue.toFixed(2) },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={load} />
      </div>

      <div className="stat-grid">
        <StatCard label="Customers" value={report.summary.totalCustomers} />
        <StatCard label="Transactions" value={report.summary.totalTransactions} />
        <StatCard label="Units sold" value={report.summary.totalQuantitySold} />
        <StatCard label="Total revenue" value={report.summary.totalRevenue.toFixed(2)} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Customer performance</h2>
        <DataTable columns={columns} rows={report.customerPerformance} rowKey={(row) => row.customerId} emptyMessage="No sales in this period." />
      </div>
    </div>
  );
};

export default CustomerReportTab;