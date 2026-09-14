const { generate, isConfigured } = require("./client");

/**
 * Reading a supplier invoice from a photograph.
 *
 * Gemini 2.5 Flash is multimodal, so the image goes in as inline data and comes
 * back as structured JSON against a fixed schema — the same responseSchema
 * pattern the existing stock-recommendation feature uses, which means a parse
 * failure here is a bug rather than a routine occurrence.
 *
 * What the model is asked for and what it is not:
 *
 *   asked for   the text on the page — descriptions, quantities, unit prices
 *   not asked   which catalogue product a line refers to (that is matching,
 *               done in invoiceMatcher.js against real data), and not any
 *               figure the page does not show
 *
 * Nothing extracted here writes stock. The result is a draft a human confirms.
 */

const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string" },
    currency: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          sku: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          lineTotal: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice"],
      },
    },
    documentTotal: { type: "number" },
    readable: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["lines", "readable"],
};

const PROMPT = `
Read this supplier invoice or delivery note and extract its line items.

Rules:
- Transcribe what is printed. Do not correct spelling, expand abbreviations, or
  tidy product names — the exact supplier wording is what makes matching work.
- quantity and unitPrice are numbers. If a line shows only a total and a
  quantity, divide to get the unit price and say so in notes.
- Leave sku empty unless a product code is actually printed on the line.
- invoiceDate as YYYY-MM-DD if you can determine it; otherwise leave it empty.
- Skip non-item rows: subtotals, tax lines, delivery charges, totals.
- Set readable to false if the image is too blurry, too dark, cropped, or is
  not an invoice at all. Say why in notes. An empty lines array with
  readable:false is a correct answer — a guessed one is not.
- Never invent a line, a quantity or a price that is not visible on the page.
`.trim();

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {string} [userId]
 * @returns {Promise<{available: boolean, readable: boolean, data: object|null, error: string|null}>}
 */
const readInvoice = async (imageBuffer, mimeType, userId = null) => {
  if (!isConfigured()) {
    return {
      available: false,
      readable: false,
      data: null,
      error:
        "Invoice reading needs a Gemini API key on the server. You can still add the purchase manually from the Purchases page.",
    };
  }

  if (!SUPPORTED_TYPES.includes(mimeType)) {
    return {
      available: true,
      readable: false,
      data: null,
      error: `Unsupported image type "${mimeType}". Use JPEG, PNG or WebP.`,
    };
  }

  const response = await generate({
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: INVOICE_SCHEMA, temperature: 0 },
    feature: "invoice_ocr",
    userId,
    // Images are the expensive call here, and the same photograph uploaded
    // twice should not be billed twice.
    cacheable: true,
  });

  if (!response?.text) {
    return {
      available: true,
      readable: false,
      data: null,
      error: "The invoice could not be read just now. Try again, or add the purchase manually.",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    return {
      available: true,
      readable: false,
      data: null,
      error: "The reader returned something unexpected. Try a clearer photo.",
    };
  }

  if (!parsed.readable) {
    return {
      available: true,
      readable: false,
      data: null,
      error: parsed.notes || "That image could not be read as an invoice.",
    };
  }

  // Defend against a plausible-looking but unusable extraction: a line with no
  // quantity is not a line.
  const lines = (parsed.lines || []).filter(
    (line) => line.description && Number(line.quantity) > 0
  );

  if (lines.length === 0) {
    return {
      available: true,
      readable: false,
      data: null,
      error: "No line items could be read from that image.",
    };
  }

  return {
    available: true,
    readable: true,
    error: null,
    data: {
      supplierName: parsed.supplierName || null,
      invoiceNumber: parsed.invoiceNumber || null,
      invoiceDate: parsed.invoiceDate || null,
      currency: parsed.currency || null,
      documentTotal: parsed.documentTotal ?? null,
      notes: parsed.notes || null,
      lines: lines.map((line) => ({
        description: String(line.description).trim(),
        sku: line.sku ? String(line.sku).trim() : null,
        quantity: Math.round(Number(line.quantity)),
        unitPrice: Number(Number(line.unitPrice || 0).toFixed(2)),
        lineTotal: line.lineTotal != null ? Number(Number(line.lineTotal).toFixed(2)) : null,
      })),
    },
  };
};

module.exports = { readInvoice, INVOICE_SCHEMA, SUPPORTED_TYPES };
