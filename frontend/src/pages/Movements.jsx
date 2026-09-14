import { useEffect, useMemo, useState } from "react";
import { getMovements } from "../api/movements";
import { getCustomers } from "../api/customers";
import { getSuppliers } from "../api/suppliers";
import ReceiptButton from "../components/ReceiptButton";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";

const Movements = () => {
  const [movements, setMovements] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");

  const [customerMap, setCustomerMap] = useState({});
  const [supplierMap, setSupplierMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLookups = async () => {
    const [customersRes, suppliersRes] = await Promise.all([getCustomers(), getSuppliers()]);

    const cMap = {};
    (customersRes.data.customers || []).forEach((c) => {
      cMap[c._id] = c.name;
    });
    setCustomerMap(cMap);

    const sMap = {};
    (suppliersRes.data.data || []).forEach((s) => {
      sMap[s._id] = s.name;
    });
    setSupplierMap(sMap);
  };

  const loadMovements = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getMovements({ page, limit: 15, type: type || undefined });
      setMovements(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups().catch(() => {
      // Non-fatal: falls back to showing raw IDs.
    });
  }, []);

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type]);

  const columns = useMemo(
    () => [
      {
        key: "type",
        header: "Type",
        render: (row) => (
          <span className={`badge badge--${row.type === "SALE" ? "healthy" : "info"}`}>{row.type}</span>
        ),
      },
      { key: "product", header: "Product", render: (row) => row.product?.name || "—" },
      { key: "quantity", header: "Qty", align: "right" },
      { key: "unitPrice", header: "Unit Price", align: "right", render: (row) => row.unitPrice.toFixed(2) },
      { key: "prevQuantity", header: "Stock Before", align: "right" },
      { key: "newQuantity", header: "Stock After", align: "right" },
      {
        key: "party",
        header: "Customer / Supplier",
        render: (row) => {
          if (row.type === "SALE") return customerMap[row.customer] || "—";
          if (row.type === "PURCHASE") return supplierMap[row.supplier] || "—";
          return "—";
        },
      },
      { key: "createdAt", header: "Date", render: (row) => new Date(row.createdAt).toLocaleString() },
      {
        key: "receipt",
        header: "",
        // Sales only - there is no such thing as a receipt for stock coming in.
        render: (row) =>
          row.type === "SALE" ? <ReceiptButton movementId={row._id} /> : null,
      },
    ],
    [customerMap, supplierMap]
  );

  return (
    <div>
      <div className="page-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter by movement type">
          {["", "SALE", "PURCHASE"].map((option) => (
            <button
              key={option || "all"}
              type="button"
              aria-pressed={type === option}
              className={`filter-tab${type === option ? " filter-tab--active" : ""}`}
              onClick={() => {
                setType(option);
                setPage(1);
              }}
            >
              {option === "" ? "All" : option === "SALE" ? "Sales" : "Purchases"}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={movements}
        rowKey={(row) => row._id}
        loading={loading}
        error={error}
        onRetry={loadMovements}
        emptyMessage="No stock movements recorded yet."
      />

      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default Movements;