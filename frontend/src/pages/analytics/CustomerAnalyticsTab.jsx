import { useEffect, useState } from "react";
import { getCustomerAnalytics, getTopCustomers } from "../../api/analytics";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const CustomerAnalyticsTab = () => {
  const [summary, setSummary] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, topRes] = await Promise.all([
        getCustomerAnalytics(),
        getTopCustomers({ limit: 8 }),
      ]);
      setSummary(summaryRes.data.data);
      setTopCustomers(topRes.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner label="Loading customer analytics…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const columns = [
    { key: "name", header: "Customer" },
    { key: "phone", header: "Phone" },
    { key: "salesCount", header: "Orders", align: "right" },
    { key: "totalQuantityPurchased", header: "Units Bought", align: "right" },
    { key: "totalSpent", header: "Total Spent", align: "right", render: (row) => row.totalSpent.toFixed(2) },
  ];

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total customers" value={summary.totalCustomers} />
        <StatCard label="Total sales" value={summary.totalSales} />
        <StatCard label="Units sold" value={summary.totalQuantitySold} />
        <StatCard label="Total revenue" value={summary.totalRevenue.toFixed(2)} />
        <StatCard label="Average sale value" value={summary.averageSaleValue.toFixed(2)} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Top customers</h2>
        <DataTable
          columns={columns}
          rows={topCustomers}
          rowKey={(row) => row.customerId}
          emptyMessage="No customer purchases yet."
        />
      </div>
    </div>
  );
};

export default CustomerAnalyticsTab;