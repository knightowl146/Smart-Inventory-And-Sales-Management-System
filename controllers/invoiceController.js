const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const { readInvoice } = require("../services/ai/invoiceReader");
const { matchInvoice, normalise } = require("../services/ai/invoiceMatcher");
const audit = require("../services/auditService");

//<---------------- POST /api/ai/invoice/extract ---------------->
/**
 * Photograph of a supplier invoice in, draft purchase out.
 *
 * The endpoint deliberately stops one step short of doing anything: it returns
 * matched line items for the owner to confirm on the Purchases form. It never
 * writes stock.
 *
 * That is not timidity. OCR on a creased thermal-printed invoice photographed
 * under shop lighting will get a digit wrong sooner or later, and a wrong digit
 * that silently becomes inventory is far more expensive than one that shows up
 * in a form waiting for a click. The feature saves the typing, which is the
 * tedious part, and leaves the judgement where it belongs.
 */
const extractInvoice = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Attach an image of the invoice as the 'invoice' field.",
      });
    }

    const result = await readInvoice(req.file.buffer, req.file.mimetype, req.user.id);

    if (!result.readable) {
      audit.record({
        action: "invoice.extract",
        outcome: "failure",
        meta: { reason: result.error, available: result.available },
      });

      return res.status(result.available ? 422 : 503).json({
        success: false,
        message: result.error,
        data: { assistantAvailable: result.available },
      });
    }

    const products = await Product.find()
      .select("name sku category quantity purchasePrice sellingPrice")
      .lean();

    const matched = matchInvoice(result.data.lines, products);

    // Try to identify the supplier too, so the form arrives prefilled. Name
    // matching only — nothing is created here.
    let supplier = null;

    if (result.data.supplierName) {
      const suppliers = await Supplier.find().select("name leadTimeDays").lean();
      const target = normalise(result.data.supplierName);

      supplier =
        suppliers.find((candidate) => normalise(candidate.name) === target) ||
        suppliers.find(
          (candidate) =>
            normalise(candidate.name).includes(target) ||
            target.includes(normalise(candidate.name))
        ) ||
        null;
    }

    audit.record({
      action: "invoice.extract",
      meta: {
        lines: matched.summary.total,
        matched: matched.summary.matched,
        unmatched: matched.summary.unmatched,
        supplierIdentified: Boolean(supplier),
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        invoice: {
          supplierName: result.data.supplierName,
          invoiceNumber: result.data.invoiceNumber,
          invoiceDate: result.data.invoiceDate,
          documentTotal: result.data.documentTotal,
          notes: result.data.notes,
        },
        supplier: supplier ? { id: supplier._id, name: supplier.name } : null,
        ...matched,
        // Stated plainly in the payload so the UI cannot accidentally present
        // this as something that has already happened.
        committed: false,
        nextStep:
          "Review each line, correct anything the reader got wrong, then confirm to record the purchases.",
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { extractInvoice };
