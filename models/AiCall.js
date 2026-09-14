const mongoose = require("mongoose");

/**
 * One row per call to the model.
 *
 * Exists so that "how much is the AI costing me" is a query rather than a
 * surprise on a statement. It is also what the monthly spend cap reads to
 * decide whether to let the next call through.
 */
const aiCallSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, index: true }, // ask | briefing | anomaly | enrich
    model: { type: String, required: true },

    promptTokens: { type: Number, default: 0 },
    responseTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },

    // Estimated, not billed. Published per-1M-token rates change, so this is a
    // running indication rather than an invoice.
    estimatedCostUsd: { type: Number, default: 0 },

    latencyMs: { type: Number, default: 0 },
    cached: { type: Boolean, default: false },
    ok: { type: Boolean, default: true },
    error: { type: String, default: null },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aiCallSchema.index({ createdAt: -1 });

module.exports = mongoose.models.AiCall || mongoose.model("AiCall", aiCallSchema);
