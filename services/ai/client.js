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
 * Model choice: gemini-2.5-flash, which is what the existing
 * stockRecommendation.js already uses. The free tier covers this app's volume,
 * and structured output via responseSchema means a parse failure is a bug
 * rather than a routine occurrence.
 */

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

// Published Gemini 2.5 Flash rates per 1M tokens, used only to estimate spend.
const COST_PER_MILLION = { input: 0.3, output: 2.5 };

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
    return null;
  }

  const startedAt = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model: MODEL, contents, config }),
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

      if (cacheable) writeCache(key, response);
      return response;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      logger.error(`AI call "${feature}" failed (attempt ${attempt + 1}): ${err.message}`);

      if (isLast) {
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
};
