import { useEffect, useRef, useState } from "react";
import apiClient from "../api/client";
import { getProducts } from "../api/products";
import { getSuppliers } from "../api/suppliers";
import { purchaseProduct } from "../api/products";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";

const STATUS_BADGE = { matched: "healthy", uncertain: "warning", unmatched: "danger" };

const STATUS_LABEL = {
  matched: "matched",
  uncertain: "check this",
  unmatched: "pick a product",
};

/**
 * Scan a supplier invoice.
 *
 * The flow is deliberately three steps with a human at the end of it: upload,
 * review, confirm. Nothing touches stock until the owner presses Record.
 *
 * OCR on a creased thermal-printed invoice photographed under shop lighting
 * will get a digit wrong eventually. Every extracted value is therefore an
 * editable field rather than a fact, the reader's original text stays visible
 * next to each row, and confidence is shown so a shaky match looks shaky. The
 * feature saves the typing, not the judgement.
 */
const ScanInvoice = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [outcome, setOutcome] = useState(null);

  const fileInput = useRef(null);

  useEffect(() => {
    getSuppliers()
      .then((response) => setSuppliers(response.data.data ?? []))
      .catch(() => setSuppliers([]));

    getProducts({ limit: 200 })
      .then((response) => setProducts(response.data.data ?? []))
      .catch(() => setProducts([]));
  }, []);

  // Revoke the object URL when the preview changes or the page unmounts,
  // otherwise each scan leaks a blob for the life of the tab.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (selected) => {
    if (!selected) return;

    setFile(selected);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(selected);
    });
    setResult(null);
    setRows([]);
    setOutcome(null);
    setError("");
  };

  const scan = async () => {
    if (!file) return;

    setScanning(true);
    setError("");
    setOutcome(null);

    const form = new FormData();
    form.append("invoice", file);

    try {
      const response = await apiClient.post("/ai/invoice/extract", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = response.data.data;
      setResult(data);
      setSupplierId(data.supplier?.id ?? "");

      setRows(
        data.lines.map((line) => ({
          productId: line.product?.id ?? "",
          quantity: line.extracted.quantity,
          unitPrice: line.extracted.unitPrice,
          description: line.extracted.description,
          status: line.status,
          confidence: line.confidence,
          alternatives: line.alternatives,
          // Unmatched lines start switched off - the owner opts them in rather
          // than having to notice and opt out.
          include: line.status !== "unmatched",
        }))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const update = (index, patch) =>
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const record = async () => {
    const selected = rows.filter((row) => row.include && row.productId && row.quantity > 0);

    if (selected.length === 0) {
      setError("Nothing to record — tick at least one line and choose its product.");
      return;
    }

    if (!supplierId) {
      setError("Choose the supplier this delivery came from.");
      return;
    }

    setRecording(true);
    setError("");

    const succeeded = [];
    const failed = [];

    // One purchase per line, sequentially. Each hits the existing transactional
    // purchase endpoint, so a failure part-way through leaves the lines that
    // did succeed correctly recorded rather than half-applying anything.
    for (const row of selected) {
      try {
        await purchaseProduct(row.productId, {
          quantity: Number(row.quantity),
          unitPrice: Number(row.unitPrice),
          supplierId,
        });
        succeeded.push(row.description);
      } catch (err) {
        failed.push(`${row.description}: ${err.message}`);
      }
    }

    setRecording(false);
    setOutcome({ succeeded, failed });

    if (failed.length === 0) {
      setRows([]);
      setResult(null);
      setFile(null);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const includedCount = rows.filter((row) => row.include && row.productId).length;

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Scan an invoice</h2>
      </div>

      {error && <ErrorBanner message={error} />}

      {outcome && (
        <div className={outcome.failed.length === 0 ? "success-banner" : "error-banner"}>
          <p>
            Recorded {outcome.succeeded.length} line
            {outcome.succeeded.length === 1 ? "" : "s"}.
            {outcome.failed.length > 0 && ` ${outcome.failed.length} failed.`}
          </p>
          {outcome.failed.map((message) => (
            <p key={message} className="field-hint">
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="panel">
        <p className="field-hint">
          Photograph a supplier invoice or delivery note. The reader extracts the
          line items and matches them to your catalogue; you check the numbers and
          confirm. Nothing is added to stock until you press Record.
        </p>

        <div className="scan__upload">
          <input
            id="invoice-file"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <Button onClick={scan} disabled={!file || scanning}>
            {scanning ? "Reading…" : "Read invoice"}
          </Button>
        </div>

        {preview && (
          <div className="scan__preview">
            <img src={preview} alt="The invoice about to be read" />
          </div>
        )}

        {scanning && <Spinner label="Reading the invoice…" />}
      </div>

      {result && (
        <>
          <div className="panel">
            <h3 className="panel__title">What the reader found</h3>

            <div className="scan__meta">
              {result.invoice.supplierName && (
                <span>
                  Supplier <strong>{result.invoice.supplierName}</strong>
                </span>
              )}
              {result.invoice.invoiceNumber && (
                <span>
                  Invoice <strong>{result.invoice.invoiceNumber}</strong>
                </span>
              )}
              {result.invoice.invoiceDate && (
                <span>
                  Date <strong>{result.invoice.invoiceDate}</strong>
                </span>
              )}
              {result.invoice.documentTotal != null && (
                <span>
                  Total on page <strong>{result.invoice.documentTotal}</strong>
                </span>
              )}
            </div>

            <p className="field-hint">
              {result.summary.matched} matched, {result.summary.uncertain} to check,{" "}
              {result.summary.unmatched} unmatched.
              {result.invoice.notes && ` Reader note: ${result.invoice.notes}`}
            </p>

            <div className="form-field">
              <label htmlFor="scan-supplier">Record against supplier</label>
              <select
                id="scan-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Choose a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel">
            <h3 className="panel__title">Check each line</h3>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Add</th>
                    <th>On the invoice</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          id={`include-${index}`}
                          type="checkbox"
                          checked={row.include}
                          onChange={(event) => update(index, { include: event.target.checked })}
                        />
                      </td>
                      <td>
                        <span className="scan__source">{row.description}</span>
                        <br />
                        <span className={`badge badge--${STATUS_BADGE[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                        {row.status !== "unmatched" && (
                          <span className="field-hint">
                            {" "}
                            {Math.round(row.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          id={`product-${index}`}
                          value={row.productId}
                          onChange={(event) => update(index, { productId: event.target.value })}
                        >
                          <option value="">Not in the catalogue — skip</option>
                          {products.map((product) => (
                            <option key={product._id} value={product._id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          id={`qty-${index}`}
                          type="number"
                          min="1"
                          className="scan__number"
                          value={row.quantity}
                          onChange={(event) => update(index, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          id={`price-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          className="scan__number"
                          value={row.unitPrice}
                          onChange={(event) => update(index, { unitPrice: event.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="scan__actions">
              <Button onClick={record} disabled={recording || includedCount === 0}>
                {recording ? "Recording…" : `Record ${includedCount} purchase${includedCount === 1 ? "" : "s"}`}
              </Button>
              <span className="field-hint">
                This adds stock and writes a movement for each line, exactly as the
                Purchases page would.
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default ScanInvoice;
