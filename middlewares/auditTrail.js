const audit = require("../services/auditService");

/**
 * Automatic audit trail for state-changing requests.
 *
 * Two layers of auditing exist in this codebase and they do different jobs:
 *
 *   1. Explicit `audit.record()` calls in controllers, where the handler knows
 *      something the HTTP layer cannot - which fields changed, why a login
 *      failed, that a refresh token was replayed. Those entries carry diffs.
 *
 *   2. This middleware, which records every other successful write at the
 *      request boundary. It exists so that a new endpoint is covered the day it
 *      is written rather than whenever someone remembers to instrument it.
 *      Coverage by default beats richer records that only exist where someone
 *      thought to add them.
 *
 * Reads are not audited: on a system this size that would be almost all of the
 * traffic and almost none of the signal.
 */

const WRITE_METHODS = { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

// First path segment after /api -> entity name used in the action string.
const RESOURCES = {
  products: "product",
  customers: "customer",
  suppliers: "supplier",
  movements: "movement",
};

// Handled by explicit audit.record() calls with better detail; recording them
// here as well would just duplicate every entry.
const EXPLICITLY_AUDITED = [/^\/api\/auth\//, /^\/api\/users/, /\/(purchase|sell)$/];

const SENSITIVE_BODY_KEYS = ["password", "newPassword", "currentPassword", "passwordHash", "token"];

const safeBody = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const copy = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_BODY_KEYS.includes(key)) continue;
    if (value !== null && typeof value === "object") continue; // keep entries flat and small
    copy[key] = value;
  }

  return Object.keys(copy).length > 0 ? copy : null;
};

const auditTrail = (req, res, next) => {
  const verb = WRITE_METHODS[req.method];

  if (!verb) return next();
  if (EXPLICITLY_AUDITED.some((pattern) => pattern.test(req.originalUrl))) return next();

  const segments = req.originalUrl.split("?")[0].split("/").filter(Boolean);
  const resource = RESOURCES[segments[1]];

  if (!resource) return next();

  // Captured up front: req.params belongs to whichever router last matched, so
  // reading it after the response has finished is not reliable. The entity id is
  // taken straight out of the path instead.
  const body = safeBody(req.body);
  const path = req.originalUrl.split("?")[0];
  const entityId = segments.find((segment) => /^[0-9a-fA-F]{24}$/.test(segment)) || null;
  const ip = req.ip || null;
  const userAgent = req.get("user-agent") || null;

  res.on("finish", () => {
    // Only successful writes. A rejected request is either a validation error
    // (noise) or a 401/403, and those are worth recording separately rather
    // than as a failed "product.update".
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (!req.user) return;

    // The actor is passed explicitly rather than read from the request context:
    // the 'finish' listener runs outside the async scope the context was
    // established in, so the ambient lookup cannot be relied on here.
    audit.record({
      action: `${resource}.${verb}`,
      entityType: resource,
      entityId,
      after: body,
      ip,
      userAgent,
      actor: { id: req.user.id, email: req.user.email, role: req.user.role },
      meta: { method: req.method, path },
    });
  });

  return next();
};

module.exports = { auditTrail };
