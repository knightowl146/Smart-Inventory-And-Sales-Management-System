import { useEffect, useState } from "react";
import { getProfitLossReport, exportProfitLossReport } from "../../api/reports";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import DateRangeFilter from "../../components/DateRangeFilter";
import ExportButtons from "../../components/ExportButtons";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import { formatMoney } from "../../utils/format";

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
    { key: "grossMargin", header: "Margin", align: "right", render: (row) => `${row.grossMargin}%` },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <DateRangeFilter onApply={handleApply} />
        <ExportButtons exportFn={exportProfitLossReport} filenameBase="profit-loss-report" params={filters} />
      </div>

      <div className="stat-grid">
        <StatCard label="Revenue" value={formatMoney(report.summary.revenue, 0)} />
        <StatCard label="Cost of goods sold" value={formatMoney(report.summary.costOfGoodsSold, 0)} />
        <StatCard label="Gross profit" value={formatMoney(report.summary.grossProfit, 0)} />
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