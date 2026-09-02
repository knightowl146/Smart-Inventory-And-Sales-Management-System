"use strict";

/**
 * exportService.js
 *
 * Thin, format-agnostic export helpers.
 * Business logic lives in the report controller; these helpers
 * only handle format conversion.
 *
 * Supported formats: csv, xlsx, pdf
 */

const { Parser }  = require("json2csv");
const ExcelJS     = require("exceljs");
const PDFDocument = require("pdfkit");


/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert an array of plain objects to a CSV string.
 *
 * @param {Object[]} data   - Array of row objects.
 * @param {string[]} fields - Ordered list of keys to include as columns.
 *                            Defaults to all keys of the first row.
 * @returns {string}        - CSV text (UTF-8, with BOM for Excel compat).
 */
const exportToCSV = (data, fields) => {
  if (!Array.isArray(data) || data.length === 0) {
    // Return header-only CSV if no data
    const header = (fields || []).join(",");
    return header ? `\uFEFF${header}\n` : "\uFEFF";
  }

  const resolvedFields = fields || Object.keys(data[0]);

  const parser = new Parser({ fields: resolvedFields });
  const csv = parser.parse(data);

  // Prepend UTF-8 BOM so Excel opens it correctly without encoding issues
  return `\uFEFF${csv}`;
};


/* ------------------------------------------------------------------ */
/* XLSX                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Convert an array of plain objects to an XLSX Buffer.
 *
 * @param {Object[]} data      - Array of row objects.
 * @param {string}   sheetName - Worksheet name.
 * @param {Array<{header:string, key:string, width?:number}>} columns
 *                             - Column definitions.  If omitted, columns
 *                               are inferred from the first row's keys.
 * @returns {Promise<Buffer>}
 */
const exportToXLSX = async (data, sheetName = "Report", columns) => {
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Resolve column definitions
  const resolvedColumns = columns || (
    data.length > 0
      ? Object.keys(data[0]).map((key) => ({
          header: key,
          key,
          width:  20
        }))
      : []
  );

  worksheet.columns = resolvedColumns;

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D6A4F" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 20;

  // Add data rows
  data.forEach((row) => {
    worksheet.addRow(row);
  });

  // Auto-fit columns (heuristic)
  worksheet.columns.forEach((col) => {
    let maxLength = (col.header || "").toString().length + 2;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value == null ? "" : cell.value.toString();
      maxLength = Math.max(maxLength, cellValue.length + 2);
    });
    col.width = Math.min(maxLength, 40);
  });

  return workbook.xlsx.writeBuffer();
};


/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert tabular data to a PDF Buffer using pdfkit.
 *
 * @param {string}   title   - Report title shown at the top.
 * @param {Object[]} data    - Array of row objects.
 * @param {Array<{label:string, key:string, width?:number}>} columns
 *                           - Column definitions.
 * @param {Object}   meta    - Optional metadata (period, generatedAt, …)
 * @returns {Promise<Buffer>}
 */
const exportToPDF = (title, data, columns, meta = {}) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks = [];

    doc.on("data",  (chunk) => chunks.push(chunk));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH  = doc.page.width  - 80; // accounting for margins
    const COL_COUNT   = columns.length;
    const COL_WIDTH   = Math.floor(PAGE_WIDTH / COL_COUNT);
    const ROW_HEIGHT  = 20;

    /* ----- Title ----- */
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(title, { align: "center" });

    doc.moveDown(0.5);

    /* ----- Meta line ----- */
    if (meta.generatedAt || meta.period) {
      let metaText = "";
      if (meta.period)      metaText += `Period: ${meta.period}  `;
      if (meta.generatedAt) metaText += `Generated: ${meta.generatedAt}`;
      doc.fontSize(9).font("Helvetica").fillColor("#555555").text(metaText, { align: "right" });
    }

    doc.moveDown(0.5).fillColor("#000000");

    /* ----- Header row ----- */
    let x = 40;
    const headerY = doc.y;

    doc
      .rect(40, headerY, PAGE_WIDTH, ROW_HEIGHT)
      .fill("#2D6A4F");

    columns.forEach((col) => {
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#FFFFFF")
        .text(col.label, x + 3, headerY + 5, {
          width:    COL_WIDTH - 6,
          ellipsis: true
        });
      x += COL_WIDTH;
    });

    doc.moveDown(0).y = headerY + ROW_HEIGHT;

    /* ----- Data rows ----- */
    data.forEach((row, idx) => {
      if (doc.y + ROW_HEIGHT > doc.page.height - 60) {
        doc.addPage();
      }

      const rowY = doc.y;
      const bg   = idx % 2 === 0 ? "#F0F4F1" : "#FFFFFF";

      doc.rect(40, rowY, PAGE_WIDTH, ROW_HEIGHT).fill(bg);

      x = 40;
      columns.forEach((col) => {
        const value = row[col.key] == null ? "" : String(row[col.key]);
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#000000")
          .text(value, x + 3, rowY + 5, {
            width:    COL_WIDTH - 6,
            ellipsis: true
          });
        x += COL_WIDTH;
      });

      doc.y = rowY + ROW_HEIGHT;
    });

    /* ----- Footer ----- */
    doc
      .moveDown(1)
      .fontSize(8)
      .fillColor("#888888")
      .text(`Total records: ${data.length}`, { align: "right" });

    doc.end();
  });
};


/* ------------------------------------------------------------------ */
/* Helper: set response headers for file downloads                      */
/* ------------------------------------------------------------------ */

/**
 * Sets the correct Content-Type and Content-Disposition headers.
 *
 * @param {import("express").Response} res
 * @param {"csv"|"xlsx"|"pdf"} format
 * @param {string} filename - Base filename without extension.
 */
const setDownloadHeaders = (res, format, filename) => {
  const map = {
    csv:  { mime: "text/csv",                                ext: "csv"  },
    xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
    pdf:  { mime: "application/pdf",                         ext: "pdf"  }
  };

  const { mime, ext } = map[format] || map.csv;

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.${ext}"`);
};


module.exports = {
  exportToCSV,
  exportToXLSX,
  exportToPDF,
  setDownloadHeaders
};
