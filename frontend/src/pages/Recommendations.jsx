import { useEffect, useMemo, useState } from "react";
import { getStockRecommendations } from "../api/analytics";
import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";

const STATUS_TONE = {
  REORDER_NOW: "danger",
  REORDER_SOON: "warning",
  HEALTHY: "healthy",
  NO_SALES: "info",
};

const STATUS_LABEL = {
  REORDER_NOW: "Reorder now",
  REORDER_SOON: "Reorder soon",
  HEALTHY: "Healthy",
  NO_SALES: "No sales",
};

const PAGE_SIZE = 10;

const Recommendations = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getStockRecommendations();
      setProducts(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const base = { REORDER_NOW: 0, REORDER_SOON: 0, HEALTHY: 0, NO_SALES: 0 };
    products.forEach((p) => {
      if (p.recommendation && base[p.recommendation] !== undefined) {
        base[p.recommendation] += 1;
      }
    });
    return base;
  }, [products]);

  const filtered = useMemo(() => {
    let rows = products;

    if (statusFilter) {
      rows = rows.filter((p) => p.recommendation === statusFilter);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(term));
    }

    return rows;
  }, [products, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const columns = [
    { key: "name", header: "Product" },
    { key: "category", header: "Category" },
    { key: "currentStock", header: "Stock", align: "right" },
    { key: "lowStockThreshold", header: "Threshold", align: "right" },
    { key: "averageDailySales", header: "Avg Daily Sales", align: "right" },
    {
      key: "salesGrowth",
      header: "Sales Growth",
      align: "right",
      render: (row) => (
        <span className={row.salesGrowth < 0 ? "text-negative" : undefined}>
          {row.salesGrowth > 0 ? "+" : ""}
          {row.salesGrowth}%
        </span>
      ),
    },
    {
      key: "daysOfStockRemaining",
      header: "Days of Stock Left",
      align: "right",
      render: (row) => row.daysOfStockRemaining ?? "—",
    },
    { key: "recommendedQuantity", header: "Reorder Qty", align: "right" },
    {
      key: "recommendation",
      header: "Status",
      render: (row) => (
        <span className={`badge badge--${STATUS_TONE[row.recommendation] || "info"}`}>
          {STATUS_LABEL[row.recommendation] || row.recommendation}
        </span>
      ),
    },
    { key: "reason", header: "Why", render: (row) => <span className="field-hint">{row.reason}</span> },
  ];

  if (loading) return <Spinner label="Loading stock recommendations…" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Reorder now" value={counts.REORDER_NOW} tone="danger" />
        <StatCard label="Reorder soon" value={counts.REORDER_SOON} tone="warning" />
        <StatCard label="Healthy" value={counts.HEALTHY} />
        <StatCard label="No sales history" value={counts.NO_SALES} />
      </div>

      <div className="page-toolbar">
        <div className="filter-tabs">
          {["", "REORDER_NOW", "REORDER_SOON", "HEALTHY", "NO_SALES"].map((status) => (
            <button
              key={status || "all"}
              type="button"
              className={`filter-tab${statusFilter === status ? " filter-tab--active" : ""}`}
              onClick={() => handleFilterChange(status)}
            >
              {status === "" ? "All" : STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        <input
          type="text"
          aria-label="Search products"
          placeholder="Search products"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.productId}
        emptyMessage="No products match this filter."
      />

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
};

export default Recommendations;