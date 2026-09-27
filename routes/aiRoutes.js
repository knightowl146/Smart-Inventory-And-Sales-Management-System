const express = require("express");
const multer = require("multer");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const router = express.Router();

const {
  askQuestion,
  getAiStatus,
  getAiUsage,
  listBriefings,
  createBriefing,
} = require("../controllers/aiController");
const { extractInvoice } = require("../controllers/invoiceController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

/**
 * Invoices are held in memory and handed straight to the model - they are
 * never written to disk. Nothing needs them after the response, and a server
 * that does not store uploads cannot leak them.
 *
 * Photographs and PDFs both. Most suppliers email invoices as PDFs rather than
 * handing over paper, so an images-only reader made the owner print the thing
 * and photograph it, which is the opposite of saving effort. Gemini reads PDFs
 * natively, text layer and all, so nothing is converted here.
 *
 * 8MB is generous for a phone photo or a few-page PDF and small enough that a
 * malicious upload cannot exhaust memory.
 */
const ACCEPTED_INVOICE = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!ACCEPTED_INVOICE.test(file.mimetype)) {
      // The status travels on the error itself. The error handler used to
      // recognise this rejection by its exact wording, so rewording the message
      // silently turned a 415 into a 500.
      const error = new Error("Upload a PDF, or a JPEG, PNG or WebP photo of the invoice.");
      error.statusCode = 415;
      return callback(error);
    }
    return callback(null, true);
  },
});

router.use(requireAuth);

/**
 * A far tighter limit than the app-wide one.
 *
 * The global limiter allows 1000 requests per 15 minutes, which is a sensible
 * ceiling for a dashboard firing a dozen reads per page and a terrible one for
 * an endpoint that costs money per call. Keyed per user rather than per IP, so
 * a shop behind one connection does not share a single allowance.
 */
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "You are asking faster than the assistant can think. Wait a moment.",
  },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
});

/**
 * Both roles may ask - the tool layer decides what each can actually see, and
 * an employee's question about margin is refused there rather than here. That
 * is the point of the design: one permission table, applied to people and to
 * the assistant acting for them.
 */
router.post("/ask", askLimiter, can(["me:read", "analytics:read"]), askQuestion);

router.get("/status", can("analytics:read"), getAiStatus);
router.get("/usage", can("analytics:read"), getAiUsage);

/**
 * Owner-only, and rate limited hard: image calls are the most expensive thing
 * this app does, and a loop of them is the one way to spend real money here.
 */
const invoiceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many invoice scans this hour. Add the purchase manually, or try later.",
  },
});

router.post(
  "/invoice/extract",
  invoiceLimiter,
  can("product:purchase"),
  upload.single("invoice"),
  extractInvoice
);

router.get("/briefings", can("analytics:read"), listBriefings);
router.post("/briefings", generateLimiter, can("analytics:read"), createBriefing);

module.exports = router;
