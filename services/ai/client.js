const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const env = require("../../config/env");
const logger = require("../../utils/logger");
const AiCall = require("../../models/AiCall");

/**
 * The single door to the model.
 *
 * Every AI feature goes through here rather than constructing its own client,
 * which is what makes the following possible in one place:
 *
 *   - a timeout, so a slow model cannot hang a request
 *   - one retry with backoff, for the transient 503s a free tier produces
 *   - an in-memory cache, so an unchanged catalogue is not re-billed on every
 *     page load
 *   - a per-call usage record and a monthly spend cap
 *   - a graceful `null` when any of that fails, so callers degrade to their
 *     deterministic answer instead of returning a 500
 *
 * Model choice: gemini-3.8-flash by default (GEMINI_MODEL overrides it). It is
 * Google's recommended stable Flash model and is on the free tier, which covers
 * this app's volume. The app started on gemini-2.5-flash; Google has since
 * restricted the 2.5 models to keys that were already using them, so a new key
 * is refused outright. Structured output via responseSchema means a parse
 * failure is a bug rather than a routine occurrence.
 */

/**
 * The model, as configuration rather than code.
 *
 * Google retires model IDs on its own schedule - and has at least once switched
 * this one off by accident before its published date. When that happens every
 * AI feature starts failing at once, and with the name hard-coded the fix is a
 * code change, a commit and a redeploy. As a setting it is one field in the
 * hosting dashboard.
 */
const MODEL = env.GEMINI_MODEL;
const TIMEOUT_MS = 20000;

/**
 * How hard the model thinks before answering.
 *
 * The Gemini 3 models reason before they reply, at "medium" by default, and
 * that reasoning is time. On the move from 2.5 Flash it pushed Ask past the
 * 20-second timeout above. Nothing this app asks for needs deep reasoning: the
 * assistant looks figures up and summarises them, the invoice reader copies
 * text off a page, and the arithmetic is done by the server either way. LOW is
 * quicker and cheaper for no loss that matters here.
 *
 * Only sent to models that understand it. The 2.5 models use a token budget
 * instead and reject a thinking level, so setting GEMINI_MODEL back to one of
 * them must not break every call.
 */
const THINKING_LEVEL = "LOW";

const withThinking = (config) =>
  /^gemini-3/.test(MODEL) && !config.thinkingConfig
    ? { ...config, thinkingConfig: { thinkingLevel: THINKING_LEVEL } }
    : config;
const MAX_RETRIES = 1;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

// Published paid-tier rates per 1M tokens for gemini-3.8-flash, used only to
// estimate spend against the monthly cap - on the free tier nothing is billed.
// Google has announced these double on 1 January 2027 (to 1.50 / 7.50).
const COST_PER_MILLION = { input: 0.75, output: 3.75 };

const MONTHLY_BUDGET_USD = Number(process.env.AI_MONTHLY_BUDGET_USD || 5);

const isConfigured = () => Boolean(env.GEMINI_API_KEY);

let client = null;
const getClient = () => {
  if (!isConfigured()) return null;
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
};

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map();

const cacheKey = (payload) =>
  crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const readCache = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.value;
};

const writeCache = (key, value) => {
  // Crude LRU: Map preserves insertion order, so the first key is the oldest.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { at: Date.now(), value });
};

const clearCache = () => cache.clear();

// ── Budget ───────────────────────────────────────────────────────────────────

let budgetCheckedAt = 0;
let budgetSpent = 0;

/**
 * Spend so far this calendar month. Cached for a minute so the cap does not
 * cost a database round trip on every single call.
 */
const monthlySpend = async () => {
  if (Date.now() - budgetCheckedAt < 60000) return budgetSpent;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const [row] = await AiCall.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$estimatedCostUsd" } } },
    ]);

    budgetSpent = row?.total ?? 0;
    budgetCheckedAt = Date.now();
  } catch {
    // If the ledger cannot be read, do not block the feature on it.
    budgetSpent = 0;
  }

  return budgetSpent;
};

const estimateCost = (usage) => {
  const input = (usage?.promptTokenCount ?? 0) / 1_000_000;
  const output = (usage?.candidatesTokenCount ?? 0) / 1_000_000;
  return input * COST_PER_MILLION.input + output * COST_PER_MILLION.output;
};

const recordCall = (entry) => {
  AiCall.create(entry).catch((err) => {
    logger.error(`AI usage write failed: ${err.message}`);
  });
};

// ── Why the last call failed ─────────────────────────────────────────────────

/**
 * The reason the most recent call gave up.
 *
 * `generate` returns null on failure so callers can degrade gracefully, and
 * that is right - but on its own it throws the reason away, which left every
 * failure reading "could not be reached" whether the key had been revoked, the
 * free quota was spent, or the model had been retired. Those have three
 * completely different fixes. Keeping the last one here lets a caller tell the
 * owner which it was, without changing what `generate` returns.
 */
let lastFailure = null;

const noteFailure = (feature, message) => {
  lastFailure = { feature, message, reason: classifyAiError(message), at: new Date() };
};

const getLastFailure = () => lastFailure;

/**
 * The last failure as one sentence an owner can act on, or null if there is
 * nothing to explain. Shared by every feature, so the assistant and the invoice
 * reader give the same diagnosis for the same fault.
 */
const describeLastFailure = () => {
  if (!lastFailure) return null;

  const explanations = {
    key: "Gemini rejected the API key. Check GEMINI_API_KEY in the server's environment - it may have been mistyped, revoked, or restricted to other APIs.",
    quota: "The Gemini quota is used up for now. Free-tier limits reset on Google's schedule; try again later, or enable billing on the key.",
    region: "Gemini does not serve the region this server runs in. That is decided by the hosting location, not the code.",
    model: `The model "${MODEL}" is not available to this key. Set GEMINI_MODEL in the server's environment to a current model.`,
    // Two different faults that used to share one message. Which one it was
    // decides whether the fix is waiting or changing something here.
    timeout: `Gemini took longer than ${TIMEOUT_MS / 1000} seconds to answer, so the app stopped waiting. If this keeps happening, the model is thinking too long for this timeout.`,
    overloaded: "Google's Gemini servers are overloaded right now - the problem is on their side, not in this app. Try again in a minute.",
    budget: `This month's AI budget of $${MONTHLY_BUDGET_USD} has been reached.`,
  };

  return (
    explanations[lastFailure.reason] ??
    `Gemini returned an error the app does not recognise: "${String(lastFailure.message).slice(0, 160)}".`
  );
};

/**
 * Sort a provider error into something a person can act on.
 *
 * Matches on the codes and phrases the Gemini API actually returns. Anything
 * unrecognised is "unknown" rather than guessed at - a wrong diagnosis sends
 * someone to fix the wrong thing.
 */
const classifyAiError = (message = "") => {
  const text = String(message);

  if (/budget/i.test(text)) return "budget";
  if (/API[_ ]?key|API_KEY_INVALID|UNAUTHENTICATED|PERMISSION_DENIED|\b40[13]\b/i.test(text)) return "key";
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b/i.test(text)) return "quota";
  // Before the model check: "User location is not supported" would otherwise
  // match "is not supported" and send someone off to change a model name that
  // was never the problem. It depends on where the server runs, not the code.
  if (/location is not supported|user location/i.test(text)) return "region";
  if (/no longer available|not found|NOT_FOUND|is not supported|\b404\b/i.test(text)) return "model";
  // Our own timeout and a dropped connection are "timeout"; Google saying it is
  // busy is "overloaded". They look alike to the person asking, but one is
  // tuned here and the other is only fixed by waiting.
  if (/timed out|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed/i.test(text)) return "timeout";
  if (/UNAVAILABLE|overloaded|\b50[0-4]\b/i.test(text)) return "overloaded";

  return "unknown";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), ms)),
  ]);

// ── The call ─────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string|Array} options.contents prompt
 * @param {object} [options.config] generateContent config (responseSchema, tools, …)
 * @param {string} options.feature label for the usage ledger
 * @param {string} [options.userId]
 * @param {boolean} [options.cacheable] default true
 * @returns {Promise<object|null>} the raw response, or null when unavailable
 */
const generate = async ({ contents, config = {}, feature, userId = null, cacheable = true }) => {
  const ai = getClient();

  if (!ai) {
    logger.warn(`AI feature "${feature}" called with no GEMINI_API_KEY set - skipping.`);
    return null;
  }

  const key = cacheKey({ contents, config, model: MODEL });

  if (cacheable) {
    const hit = readCache(key);
    if (hit) {
      recordCall({ feature, model: MODEL, cached: true, requestedBy: userId, ok: true });
      return hit;
    }
  }

  if ((await monthlySpend()) >= MONTHLY_BUDGET_USD) {
    logger.warn(
      `AI monthly budget of $${MONTHLY_BUDGET_USD} reached - "${feature}" is degrading to its deterministic path.`
    );
    noteFailure(feature, `Monthly AI budget of $${MONTHLY_BUDGET_USD} reached`);
    return null;
  }

  const startedAt = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model: MODEL, contents, config: withThinking(config) }),
        TIMEOUT_MS
      );

      const latencyMs = Date.now() - startedAt;
      const usage = response?.usageMetadata;

      recordCall({
        feature,
        model: MODEL,
        promptTokens: usage?.promptTokenCount ?? 0,
        responseTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
        estimatedCostUsd: estimateCost(usage),
        latencyMs,
        cached: false,
        ok: true,
        requestedBy: userId,
      });

      // A fresh call changes the running total; drop the cached figure.
      budgetCheckedAt = 0;
      // And a success means whatever was wrong before no longer is.
      lastFailure = null;

      if (cacheable) writeCache(key, response);
      return response;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      logger.error(`AI call "${feature}" failed (attempt ${attempt + 1}): ${err.message}`);

      if (isLast) {
        noteFailure(feature, err.message);
        recordCall({
          feature,
          model: MODEL,
          latencyMs: Date.now() - startedAt,
          ok: false,
          error: err.message,
          requestedBy: userId,
        });
        return null;
      }

      await sleep(500 * (attempt + 1));
    }
  }

  return null;
};

/** Convenience for the common case: structured JSON out. */
const generateJson = async ({ prompt, responseSchema, feature, userId, cacheable = true }) => {
  const response = await generate({
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema },
    feature,
    userId,
    cacheable,
  });

  if (!response?.text) return null;

  try {
    return JSON.parse(response.text);
  } catch (err) {
    logger.error(`AI feature "${feature}" returned unparseable JSON: ${err.message}`);
    return null;
  }
};

module.exports = {
  MODEL,
  MONTHLY_BUDGET_USD,
  isConfigured,
  generate,
  generateJson,
  monthlySpend,
  clearCache,
  estimateCost,
  classifyAiError,
  getLastFailure,
  describeLastFailure,
};
