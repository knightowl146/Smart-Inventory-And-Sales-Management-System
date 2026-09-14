/**
 * Synthetic demand that a forecaster can actually learn from.
 *
 * The old seeder wrote four fixed purchase batches and a handful of sales per
 * product over 25 days. That is enough to populate a dashboard and nowhere near
 * enough to fit a seasonal model — which is why the Forecast page had nothing to
 * say. This generates a daily series with the structure real retail demand has:
 *
 *   a base rate       different per product, so the catalogue is not uniform
 *   weekly seasonality weekends busier, which is the pattern Holt-Winters finds
 *   a slow trend       some products growing, some fading
 *   noise              otherwise the model looks implausibly good
 *   occasional spikes  a bulk order, so anomaly detection has something to find
 *
 * Everything is derived from a seeded pseudo-random generator keyed on the
 * product's SKU, so re-running the seeder produces the same history. That makes
 * a demo reproducible and means a screenshot taken today still matches the data
 * next week.
 */

/**
 * Mulberry32 — a small, fast, deterministic PRNG.
 *
 * Math.random() cannot be seeded, and an unseeded seeder makes every rerun a
 * different shop. Thirty lines of arithmetic is a fair price for reproducibility.
 */
const createRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A stable 32-bit hash of a string, so the same SKU always seeds the same way. */
const hashString = (value) => {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

// Multipliers by day of week, Sunday first. Roughly a corner shop: quiet
// midweek, busy Saturday.
const WEEKDAY_FACTORS = [1.25, 0.8, 0.85, 0.9, 1.0, 1.15, 1.45];

const TRENDS = ["growing", "steady", "fading"];

/**
 * A product's demand profile, derived deterministically from its SKU.
 *
 * @param {string} sku
 * @returns {{baseRate: number, trend: string, trendStrength: number, volatility: number, spikeChance: number}}
 */
const profileFor = (sku) => {
  const random = createRandom(hashString(sku));

  // Long tail: a few products sell a lot, most sell a little. A uniform
  // distribution would make ABC analysis and dead-stock detection meaningless.
  const roll = random();
  const baseRate =
    roll > 0.88
      ? 12 + random() * 18 // fast movers
      : roll > 0.55
        ? 3 + random() * 6 // steady sellers
        : 0.3 + random() * 2; // slow movers

  return {
    baseRate: Number(baseRate.toFixed(2)),
    trend: TRENDS[Math.floor(random() * TRENDS.length)],
    trendStrength: 0.1 + random() * 0.5,
    volatility: 0.15 + random() * 0.35,
    spikeChance: random() * 0.02, // up to one day in fifty
  };
};

/**
 * Daily sale quantities for one product over `days`, oldest first.
 *
 * @param {string} sku
 * @param {number} days
 * @returns {Array<{dayOffset: number, quantity: number, isSpike: boolean}>}
 *          dayOffset counts back from today: `days` is the oldest day, 1 is yesterday.
 */
const generateDailyDemand = (sku, days) => {
  const profile = profileFor(sku);
  const random = createRandom(hashString(`${sku}:series`));
  const series = [];

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let dayOffset = days; dayOffset >= 1; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);

    const progress = (days - dayOffset) / days; // 0 at the start, 1 at today

    const trendFactor =
      profile.trend === "growing"
        ? 1 + profile.trendStrength * progress
        : profile.trend === "fading"
          ? 1 - profile.trendStrength * progress * 0.8
          : 1;

    const weekday = WEEKDAY_FACTORS[date.getDay()];

    // Multiplicative noise centred on 1, so a quiet day is quiet in proportion.
    const noise = 1 + (random() - 0.5) * 2 * profile.volatility;

    const isSpike = random() < profile.spikeChance;
    const spikeFactor = isSpike ? 4 + random() * 4 : 1;

    const expected = profile.baseRate * trendFactor * weekday * noise * spikeFactor;

    // Demand is whole units, and most quiet days genuinely sell nothing.
    const quantity = Math.max(0, Math.round(expected));

    if (quantity > 0) {
      series.push({ dayOffset, quantity, isSpike, date: new Date(date) });
    }
  }

  return series;
};

/**
 * Purchases that keep stock positive across the generated sales.
 *
 * Walks the sales forward, and whenever projected stock would drop below a
 * cover threshold, schedules a delivery a few days earlier. Without this the
 * ledger goes negative and the stock figures make no sense — which matters more
 * than it sounds, because the reorder maths reads current stock.
 *
 * @returns {Array<{dayOffset: number, quantity: number, date: Date}>}
 */
const generateRestocks = (sku, sales, days, { startingStock = 0, coverDays = 21 } = {}) => {
  const random = createRandom(hashString(`${sku}:restock`));
  const profile = profileFor(sku);

  const restocks = [];
  let stock = startingStock;

  const targetCover = Math.max(10, Math.ceil(profile.baseRate * coverDays));

  // An opening delivery, so the shop does not begin at zero.
  restocks.push({
    dayOffset: days,
    quantity: targetCover,
    date: sales[0]?.date ? new Date(sales[0].date) : new Date(),
  });
  stock += targetCover;

  for (const sale of sales) {
    if (stock - sale.quantity < Math.ceil(profile.baseRate * 3)) {
      const quantity = targetCover + Math.round(random() * targetCover * 0.3);

      restocks.push({
        dayOffset: sale.dayOffset + 1,
        quantity,
        date: new Date(sale.date.getTime() - 24 * 60 * 60 * 1000),
      });

      stock += quantity;
    }

    stock -= sale.quantity;
  }

  return restocks;
};

module.exports = {
  createRandom,
  hashString,
  profileFor,
  generateDailyDemand,
  generateRestocks,
  WEEKDAY_FACTORS,
};
