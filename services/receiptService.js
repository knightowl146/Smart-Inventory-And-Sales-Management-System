const PDFDocument = require("pdfkit");

/**
 * Sale receipts.
 *
 * Streamed to the response rather than buffered: a receipt is small, but the
 * same shape works for a day's worth of them and it means no temporary files.
 *
 * Two things this deliberately does not do:
 *
 *   - It never prints a cost price or a margin. A receipt is handed to a
 *     customer, and the response filter that protects those fields elsewhere
 *     only covers res.json - a PDF stream goes around it entirely. So the
 *     omission has to be built in here rather than relied on downstream.
 *   - It does not invent a tax breakdown. The system has no tax configuration,
 *     and a receipt that shows a made-up VAT line is worse than one that shows
 *     none.
 */

const COLORS = {
  ink: "#171b1f",
  muted: "#5f6a75",
  rule: "#d9ddd7",
  accent: "#2f6f4e",
};

const money = (value) => Number(value || 0).toFixed(2);

const formatDateTime = (date) =>
  new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * @param {object} sale
 * @param {string} sale.receiptNumber
 * @param {Date}   sale.date
 * @param {{name: string, sku: string}} sale.product
 * @param {number} sale.quantity
 * @param {number} sale.unitPrice
 * @param {{name: string, phone?: string}|null} sale.customer
 * @param {{name: string, role: string}|null} sale.servedBy
 * @param {{name: string, line1?: string, phone?: string}} [shop]
 * @param {import("stream").Writable} stream
 */
const renderReceipt = (sale, shop, stream) => {
  // 80mm thermal-roll width in points, the size a counter printer expects.
  const WIDTH = 226;
  const MARGIN = 16;
  const CONTENT = WIDTH - MARGIN * 2;

  const doc = new PDFDocument({
    size: [WIDTH, 520],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  });

  doc.pipe(stream);

  const rule = () => {
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(WIDTH - MARGIN, doc.y)
      .strokeColor(COLORS.rule)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.5);
  };

  const row = (left, right, options = {}) => {
    const y = doc.y;
    doc
      .fontSize(options.size || 8)
      .fillColor(options.color || COLORS.ink)
      .font(options.bold ? "Helvetica-Bold" : "Helvetica");

    doc.text(left, MARGIN, y, { width: CONTENT * 0.62, continued: false });
    doc.text(right, MARGIN + CONTENT * 0.62, y, {
      width: CONTENT * 0.38,
      align: "right",
    });
  };

  // ── Header ────────────────────────────────────────────────────────────────
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.ink)
    .text(shop?.name || "Smart Inventory", { align: "center" });

  if (shop?.line1) {
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text(shop.line1, { align: "center" });
  }
  if (shop?.phone) {
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text(shop.phone, { align: "center" });
  }

  doc.moveDown(0.6);
  rule();

  // ── Meta ──────────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
  row("Receipt", sale.receiptNumber, { size: 7, color: COLORS.muted });
  row("Date", formatDateTime(sale.date), { size: 7, color: COLORS.muted });

  if (sale.customer?.name) {
    row("Customer", sale.customer.name, { size: 7, color: COLORS.muted });
  }
  if (sale.servedBy?.name) {
    row("Served by", sale.servedBy.name, { size: 7, color: COLORS.muted });
  }

  doc.moveDown(0.5);
  rule();

  // ── Line items ────────────────────────────────────────────────────────────
  doc.moveDown(0.2);
  row("ITEM", "AMOUNT", { bold: true, size: 7, color: COLORS.muted });
  doc.moveDown(0.3);

  const lineTotal = Number(sale.quantity) * Number(sale.unitPrice);

  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.ink);
  doc.text(sale.product.name, MARGIN, doc.y, { width: CONTENT });

  row(
    `${sale.quantity} x ${money(sale.unitPrice)}`,
    money(lineTotal),
    { size: 8 }
  );

  if (sale.product.sku) {
    doc.font("Helvetica").fontSize(6.5).fillColor(COLORS.muted).text(sale.product.sku, MARGIN, doc.y, {
      width: CONTENT,
    });
  }

  doc.moveDown(0.6);
  rule();

  // ── Total ─────────────────────────────────────────────────────────────────
  doc.moveDown(0.2);
  row("TOTAL", money(lineTotal), { bold: true, size: 11, color: COLORS.accent });

  doc.moveDown(0.8);
  rule();

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.moveDown(0.4);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text("Thank you for your custom.", { align: "center" });

  doc
    .fontSize(6)
    .fillColor(COLORS.muted)
    .text("Keep this receipt for returns or exchanges.", { align: "center" });

  doc.end();
};

/**
 * A short, human-quotable receipt number derived from the movement id.
 *
 * Deterministic on purpose: the same sale always produces the same number, so a
 * reprint matches the original without storing anything extra.
 */
const receiptNumberFor = (movementId, date) => {
  const stamp = new Date(date).toISOString().slice(2, 10).replace(/-/g, "");
  const tail = String(movementId).slice(-5).toUpperCase();
  return `R-${stamp}-${tail}`;
};

module.exports = { renderReceipt, receiptNumberFor, formatDateTime, money };
