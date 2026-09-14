const { roleHas } = require("./permissions");

/**
 * Last line of defence for cost data.
 *
 * Route guards decide which endpoints a role may call. They do not decide which
 * *fields* come back, and that matters here: `GET /api/products` is a legitimate
 * employee request, but the response carries `purchasePrice`, which is the
 * business's margin on every item in the catalogue.
 *
 * Rather than thread a role-aware serialiser through every controller (easy to
 * forget on the next endpoint someone adds), this wraps res.json once and
 * removes a denylist of financial keys, at any depth, for roles that lack
 * "finance:read". Fail-closed: a new endpoint that returns a cost field is
 * filtered automatically.
 *
 * Two things it deliberately does NOT do:
 *   - it does not touch owner responses at all (no cost, no risk of surprise),
 *   - it does not protect file downloads, which bypass res.json entirely. The
 *     export routes are owner-only at the router level for exactly that reason.
 */
const FINANCIAL_FIELDS = Object.freeze([
  "purchasePrice",
  "costPrice",
  "totalCost",
  "totalPurchaseValue",
  "purchaseValue",
  "profit",
  "grossProfit",
  "netProfit",
  "profitMargin",
  "margin",
  "marginPercentage",
  "inventoryValue",
  "totalInventoryValue",
]);

const scrub = (value, fields, seen) => {
  if (value === null || typeof value !== "object") return value;

  // Cycles are not expected in JSON responses, but a guard costs nothing and
  // turns a would-be stack overflow into a no-op.
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = scrub(value[i], fields, seen);
    }
    return value;
  }

  for (const key of Object.keys(value)) {
    if (fields.includes(key)) {
      delete value[key];
    } else {
      value[key] = scrub(value[key], fields, seen);
    }
  }

  return value;
};

const responseFilter = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // Anonymous responses are login errors and the health check - nothing to
    // filter, and req.user does not exist yet.
    if (req.user && !roleHas(req.user.role, "finance:read")) {
      return originalJson(scrub(body, FINANCIAL_FIELDS, new WeakSet()));
    }
    return originalJson(body);
  };

  return next();
};

module.exports = { responseFilter, FINANCIAL_FIELDS };
