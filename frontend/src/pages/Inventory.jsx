import { useEffect, useState } from "react";
import { getProducts } from "../api/products";
import { getInventoryHealth } from "../api/analytics";
import DataTable from "../components/DataTable";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";

const statusFor = (product) => {
  if (product.quantity === 0) return { label: "Out of stock", tone: "danger" };
  if (product.quantity <= product.lowStockThreshold) return { label: "Low stock", tone: "warning" };
  return { label: "Healthy", tone: "healthy" };
};

const Inventory = () => {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHealth = async () => {
    try {
      const res = await getInventoryHealth();
      setHealth(res.data.data);
    } catch (err) {
      setHealthError(err.message);
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getProducts({ page, limit: 15 });
      setProducts(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const columns = [
    { key: "name", header: "Product" },
    { key: "sku", header: "SKU" },
    { key: "category", header: "Category" },
    { key: "quantity", header: "In Stock", align: "right" },
    { key: "lowStockThreshold", header: "Threshold", align: "right" },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status = statusFor(row);
        return <span className={`badge badge--${status.tone}`}>{status.label}</span>;
      },
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (row) => (row.quantity * row.purchasePrice).toFixed(2),
    },
  ];

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total products" value={health?.totalProducts ?? "—"} />
        <StatCard label="Total units in stock" value={health?.totalQuantity ?? "—"} />
        <StatCard label="Low stock" value={health?.lowStockProducts ?? "—"} tone="warning" />
        <StatCard label="Out of stock" value={health?.outOfStockProducts ?? "—"} tone="danger" />
        <StatCard label="Inventory value" value={health ? health.inventoryValue.toFixed(2) : "—"} />
      </div>

      {healthError && <div className="error-banner" role="alert"><p>{healthError}</p></div>}

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(row) => row._id}
        loading={loading}
        error={error}
        onRetry={loadProducts}
        emptyMessage="No products found."
      />

      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default Inventory;