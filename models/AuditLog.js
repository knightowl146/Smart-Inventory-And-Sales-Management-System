const mongoose = require("mongoose");

/**
 * Append-only record of every state change and every authentication event.
 *
 * The actor is denormalised on purpose: the log has to stay readable after the
 * user who caused the entry is deleted, so we keep their email and role at the
 * time of the action rather than only a reference that may dangle.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      email: { type: String, default: "anonymous" },
      role: { type: String, default: "anonymous" },
    },

    // Dotted "<entity>.<verb>" - e.g. auth.login, product.update, user.deactivate
    action: { type: String, required: true, index: true },

    entity: {
      type: { type: String, default: null },
      id: { type: String, default: null },
    },

    outcome: {
      type: String,
      enum: ["success", "failure"],
      default: "success",
      index: true,
    },

    // Only the fields that actually changed, never whole documents.
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The log is almost always read newest-first, optionally narrowed to one actor.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ "actor.id": 1, createdAt: -1 });

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
