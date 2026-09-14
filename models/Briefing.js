const mongoose = require("mongoose");

/**
 * A generated business briefing.
 *
 * Stored rather than generated on demand for two reasons: it costs one model
 * call a week instead of one per page view, and it gives the owner a history
 * they can scroll back through - "what did last month look like" answered by
 * reading, not by re-running anything.
 *
 * `metrics` holds the figures the narrative was written from, so the page can
 * show the numbers next to the prose and a reader can check the model's work.
 */
const briefingSchema = new mongoose.Schema(
  {
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    headline: { type: String, required: true },
    highlights: { type: [String], default: [] },
    actions: { type: [String], default: [] },

    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },

    // "ai" when Gemini wrote the prose, "deterministic" when it was unavailable
    // and the server assembled the summary itself.
    source: { type: String, enum: ["ai", "deterministic"], default: "deterministic" },

    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

briefingSchema.index({ periodEnd: -1 });

module.exports = mongoose.models.Briefing || mongoose.model("Briefing", briefingSchema);
