import { useState } from "react";
import Button from "./Button";
import { downloadBlob } from "../api/reports";

const FORMATS = [
  { key: "csv", label: "CSV" },
  { key: "xlsx", label: "Excel" },
  { key: "pdf", label: "PDF" },
];

const ExportButtons = ({ exportFn, filenameBase, params }) => {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const handleExport = async (format) => {
    setPending(format);
    setError(null);

    try {
      const res = await exportFn({ ...params, format });
      downloadBlob(res.data, `${filenameBase}.${format}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="export-buttons">
      {FORMATS.map((format) => (
        <Button
          key={format.key}
          variant="secondary"
          disabled={pending !== null}
          onClick={() => handleExport(format.key)}
        >
          {pending === format.key ? "Exporting…" : `Export ${format.label}`}
        </Button>
      ))}
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
};

export default ExportButtons;