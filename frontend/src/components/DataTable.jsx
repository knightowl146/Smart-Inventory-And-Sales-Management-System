import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import ErrorBanner from "./ErrorBanner";

const DataTable = ({ columns, rows, rowKey, loading, error, onRetry, emptyMessage }) => {
  if (loading) return <Spinner label="Loading…" />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage || "Nothing here yet."} />;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.align ? { textAlign: col.align } : undefined}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;