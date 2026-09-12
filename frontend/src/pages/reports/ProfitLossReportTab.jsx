import { useEffect, useState } from "react";
import { getProfitLossReport, exportProfitLossReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import ExportButtons from "../../components/ExportButtons";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";

const ProfitLossReportTab = () => {
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (params = filters) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getProfitLossReport(params);
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

  if (loading) return <Spinner label="Loading profit & loss report…" />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;

  const categoryColumns = [
    { key: "category", header: "Category" },
    { key: "revenue", header: "Revenue", align: "right", render: (row) => row.revenue.toFixed(2) },
    { key: "costOfGoodsSold", header: "COGS", align: "right", render: (row) => row.costOfGoodsSold.toFixed(2) },
    {
      key: "grossProfit",
      header: "Gross Profit",
      align: "right",
      render: (row) => (
        <span className={row.grossProfit < 0 ? "text-negative" : undefined}>{row.grossProfit.toFixed(2)}</span>
      ),
    },
    { key: "grossMargin", header: "Margin", align: "right", render: (row) => `${row.grossMargin}%` },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={handleApply} />
        <ExportButtons exportFn={exportProfitLossReport} filenameBase="profit-loss-report" params={filters} />
      </div>

      <div className="stat-grid">
        <StatCard label="Revenue" value={report.summary.revenue.toFixed(2)} />
        <StatCard label="Cost of goods sold" value={report.summary.costOfGoodsSold.toFixed(2)} />
        <StatCard label="Gross profit" value={report.summary.grossProfit.toFixed(2)} />
        <StatCard label="Gross margin" value={`${report.summary.grossMargin.toFixed(1)}%`} />
      </div>

      <div className="panel">
        <h2 className="panel__title">Profit by category</h2>
        <DataTable columns={categoryColumns} rows={report.profitByCategory} rowKey={(row) => row.category} emptyMessage="No sales in this period." />
      </div>
    </div>
  );
};

export default ProfitLossReportTab;