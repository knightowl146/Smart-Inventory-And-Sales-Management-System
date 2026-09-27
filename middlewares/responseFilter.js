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

/**
 * What a public demo visitor may not see: other people's contact details.
 *
 * The demo owner account shows the real Staff page and Activity Log, which is
 * the point - but those list the real accounts' email addresses, and the
 * activity log records the IP address and browser of everyone who signed in,
 * including other demo visitors. Masked at any depth, the same way cost fields
 * are stripped for employees; the visitor's own email is left alone.
 */
const PRIVATE_FIELDS = Object.freeze(["email", "ip", "userAgent"]);

/** "dakshita@gmail.com" -> "d•••••@gmail.com" */
const maskEmail = (value) => {
  const text = String(value);
  const at = text.indexOf("@");
  if (at < 1) return "•••••";
  return `${text[0]}•••••${text.slice(at)}`;
};

const maskPrivate = (value, ownEmail, seen) => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = maskPrivate(value[i], ownEmail, seen);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (!PRIVATE_FIELDS.includes(key)) {
      value[key] = maskPrivate(value[key], ownEmail, seen);
    } else if (typeof value[key] === "string" && value[key]) {
      if (key === "email") {
        if (value[key].toLowerCase() !== ownEmail) value[key] = maskEmail(value[key]);
      } else {
        value[key] = "hidden in the demo";
      }
    }
  }

  return value;
};

/**
 * Mongoose documents serialise through toJSON when Express stringifies them,
 * after this filter has run - so they are turned into plain objects first, or
 * the fields to remove would not be visible yet.
 */
const plain = (body) => JSON.parse(JSON.stringify(body));

const responseFilter = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // Anonymous responses are login errors and the health check - nothing to
    // filter, and req.user does not exist yet.
    if (!req.user || body === null || typeof body !== "object") return originalJson(body);

    let filtered = body;

    if (!roleHas(req.user.role, "finance:read")) {
      filtered = scrub(filtered, FINANCIAL_FIELDS, new WeakSet());
    }

    if (req.user.isDemo) {
      filtered = maskPrivate(plain(filtered), String(req.user.email).toLowerCase(), new WeakSet());
    }

    return originalJson(filtered);
  };

  return next();
};

module.exports = { responseFilter, FINANCIAL_FIELDS, PRIVATE_FIELDS, maskEmail, maskPrivate };
