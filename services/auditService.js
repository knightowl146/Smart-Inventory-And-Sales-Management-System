const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const { getActor, getRequestMeta } = require("../middlewares/requestContext");

/**
 * Write one audit entry.
 *
 * Deliberately never throws and never blocks the response: an audit failure
 * must not turn a successful sale into a 500. Failures are logged so they are
 * still visible in the application log.
 *
 * @param {object}  entry
 * @param {string}  entry.action    "<entity>.<verb>", e.g. "product.update"
 * @param {string} [entry.entityType]
 * @param {string} [entry.entityId]
 * @param {"success"|"failure"} [entry.outcome]
 * @param {object} [entry.before]   only the fields that changed
 * @param {object} [entry.after]
 * @param {object} [entry.meta]
 * @param {object} [entry.actor]    overrides the ambient request actor
 * @param {string} [entry.ip]       overrides the ambient request IP
 * @param {string} [entry.userAgent]
 */
const record = ({
  action,
  entityType = null,
  entityId = null,
  outcome = "success",
  before = null,
  after = null,
  meta = null,
  actor = null,
  ip = null,
  userAgent = null,
}) => {
  // Audit writes are not awaited, so one can still be in flight when the
  // process (or a test's in-memory server) tears the connection down. Dropping
  // it is correct - the request it described has already finished - and it
  // keeps a shutdown from filling the log with "client was closed" errors.
  if (mongoose.connection.readyState !== 1) return;

  const ambient = getRequestMeta();

  const entry = {
    actor: actor || getActor(),
    action,
    entity: { type: entityType, id: entityId ? String(entityId) : null },
    outcome,
    changes: { before, after },
    ip: ip ?? ambient.ip,
    userAgent: userAgent ?? ambient.userAgent,
    meta,
  };

  // Fire and forget. The caller does not await this.
  AuditLog.create(entry).catch((err) => {
    logger.error(`Audit write failed for "${action}": ${err.message}`);
  });
};

/**
 * Reduce a before/after pair to just the fields that actually changed, so the
 * log stores a diff rather than two copies of a whole document.
 */
const diff = (before, after, fields) => {
  const changedBefore = {};
  const changedAfter = {};

  for (const field of fields) {
    const oldValue = before?.[field];
    const newValue = after?.[field];

    if (String(oldValue) !== String(newValue)) {
      changedBefore[field] = oldValue;
      changedAfter[field] = newValue;
    }
  }

  const changed = Object.keys(changedAfter).length > 0;

  return changed
    ? { before: changedBefore, after: changedAfter }
    : { before: null, after: null };
};

module.exports = { record, diff };
