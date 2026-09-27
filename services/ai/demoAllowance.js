const { ipKeyGenerator } = require("express-rate-limit");
const AiCall = require("../../models/AiCall");
const { getContext } = require("../../middlewares/requestContext");

/**
 * How much AI the public demo accounts may use.
 *
 * Being read-only stops a demo visitor changing data, but asking questions and
 * reading invoices are reads - and each one is a paid model call against the
 * same Gemini key and monthly budget the real shop uses. Without a limit, one
 * visitor with a script could spend the month's budget in an afternoon and
 * leave the assistant switched off for the owner until the 1st.
 *
 * Three limits, all checked before a model call is made (cached answers are
 * free and always allowed):
 *
 *   per visitor   calls per IP address per day, so one person cannot use up
 *                 the demo for everyone else
 *   per account   calls per demo account per day, counted from the usage
 *                 ledger in the database - so it survives the server restarting,
 *                 which on a free host happens every time it wakes up
 *   budget share  demo accounts stop once this month's spend passes a share
 *                 of the budget, keeping the rest for the real owner
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const limits = () => ({
  perVisitor: Number(process.env.DEMO_AI_VISITOR_DAILY_LIMIT) || 30,
  perAccount: Number(process.env.DEMO_AI_DAILY_LIMIT) || 150,
  budgetShare: Number(process.env.DEMO_AI_BUDGET_SHARE) || 0.5,
});

// Visitor -> timestamps of their recent model calls. In memory on purpose:
// this is the fine-grained, fast-moving limit; the database-backed per-account
// limit is the one that has to survive a restart.
const visitorCalls = new Map();

const recentCalls = (key, now) => {
  const kept = (visitorCalls.get(key) ?? []).filter((at) => now - at < DAY_MS);
  if (kept.length) visitorCalls.set(key, kept);
  else visitorCalls.delete(key);
  return kept;
};

/** The demo user making the current request, or null for a real account. */
const currentDemoRequest = () => {
  const { req } = getContext();
  return req?.user?.isDemo ? req : null;
};

/**
 * @param {object} options
 * @param {() => Promise<number>} options.monthlySpend this month's AI spend in USD
 * @param {number} options.monthlyBudget the cap in USD
 * @param {Date} [options.now]
 * @returns {Promise<null|string>} null to go ahead, or why the demo cannot
 */
const checkDemoAllowance = async ({ monthlySpend, monthlyBudget, now = new Date() }) => {
  const req = currentDemoRequest();
  if (!req) return null;

  const { perVisitor, perAccount, budgetShare } = limits();
  const visitor = `${req.user.id}:${ipKeyGenerator(req.ip || "0.0.0.0")}`;

  if (recentCalls(visitor, now.getTime()).length >= perVisitor) {
    return `The demo allows ${perVisitor} AI requests per visitor a day, and you have used them. Everything else in the app still works.`;
  }

  const accountCalls = await AiCall.countDocuments({
    requestedBy: req.user.id,
    cached: false,
    createdAt: { $gte: new Date(now.getTime() - DAY_MS) },
  });

  if (accountCalls >= perAccount) {
    return "The demo's AI allowance for today has been used up by other visitors. It refreshes over the next 24 hours; everything else in the app still works.";
  }

  if ((await monthlySpend()) >= monthlyBudget * budgetShare) {
    return "The demo's share of this month's AI budget has been used. Everything else in the app still works.";
  }

  return null;
};

/** Count a model call against the current demo visitor. */
const noteDemoCall = (now = new Date()) => {
  const req = currentDemoRequest();
  if (!req) return;

  const visitor = `${req.user.id}:${ipKeyGenerator(req.ip || "0.0.0.0")}`;
  visitorCalls.set(visitor, [...recentCalls(visitor, now.getTime()), now.getTime()]);
};

/** For tests. */
const resetDemoAllowance = () => visitorCalls.clear();

module.exports = { checkDemoAllowance, noteDemoCall, resetDemoAllowance, limits };
