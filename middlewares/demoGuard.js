/**
 * The public demo accounts are read-only.
 *
 * Their passwords are printed on the login page, so anyone can sign in - a
 * recruiter trying the app, or someone who would rather script a million fake
 * sales. The server cannot tell those apart and does not try: for a demo
 * account, every request that could change data is refused, whatever the UI
 * shows and whoever is calling the API directly.
 *
 * Checked inside requireAuth, the one step every protected route passes
 * through, so a route added next year is covered without anyone remembering to
 * add a guard. Allow-listed, not deny-listed, for the same reason: a new write
 * endpoint is blocked for demo users by default.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * POST requests that read rather than write. Asking a question and reading an
 * invoice both use POST (a question body, a file upload) but change nothing in
 * the shop's data; their cost is capped separately by services/ai/demoAllowance.js.
 * Recording the scanned invoice as purchases is a separate write, and blocked.
 */
const READ_ONLY_POSTS = Object.freeze(["/api/ai/ask", "/api/ai/invoice/extract"]);

const DEMO_READ_ONLY_MESSAGE =
  "This is the read-only demo account, so changes are switched off. Everything you can view is live data.";

const requestPath = (req) => `${req.baseUrl || ""}${req.path || ""}`.replace(/\/+$/, "");

/** May a demo account make this request? */
const isAllowedForDemo = (req) =>
  SAFE_METHODS.has(req.method) ||
  (req.method === "POST" && READ_ONLY_POSTS.includes(requestPath(req)));

/** The 403 a demo account gets for anything that would change data. */
const refuseDemoWrite = (res) =>
  res.status(403).json({
    success: false,
    code: "DEMO_READ_ONLY",
    message: DEMO_READ_ONLY_MESSAGE,
  });

module.exports = { isAllowedForDemo, refuseDemoWrite, DEMO_READ_ONLY_MESSAGE, READ_ONLY_POSTS };
