import { useState } from "react";
import { fetchReceipt } from "../api/intelligence";
import Button from "./Button";

/**
 * Opens a sale's receipt in a new tab.
 *
 * The PDF endpoint is authenticated, so it cannot be an ordinary link - the
 * browser would send that request without the Authorization header and get a
 * 401. Fetching it as a blob and handing the browser an object URL is the way
 * to print an authenticated document without putting a token in a query string
 * where it would end up in logs and history.
 */
const ReceiptButton = ({ movementId, label = "Receipt", variant = "secondary" }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setBusy(true);
    setError("");

    let objectUrl;

    try {
      const response = await fetchReceipt(movementId);
      objectUrl = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));

      const opened = window.open(objectUrl, "_blank", "noopener");

      if (!opened) {
        // Popup blocked - fall back to a download the person triggered.
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `receipt-${movementId}.pdf`;
        link.click();
      }
    } catch (err) {
      setError(err.message || "Could not load that receipt.");
    } finally {
      setBusy(false);
      // Give the new tab a moment to take the URL before releasing it.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
  };

  return (
    <>
      <Button variant={variant} onClick={open} disabled={busy}>
        {busy ? "Opening…" : label}
      </Button>
      {error && <span className="form-field__error">{error}</span>}
    </>
  );
};

export default ReceiptButton;
