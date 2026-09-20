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
 * Draw a day's unit sales as a count, not as a rounded average.
 *
 * Rounding an expectation to the nearest whole number is wrong at both ends of
 * this catalogue, in two different ways. Below half a unit a day - every laptop
 * and television - Math.round returns zero every single day, so the product
 * never sells at all, lands in dead stock on day one and gives the forecaster
 * no history. And around one a day - tablets, monitors - it returns exactly 1
 * every single day for six months, a series so unnaturally flat that "tomorrow
 * equals today" predicts it perfectly and no real model can beat that. The
 * second failure is the more embarrassing one, because it makes an honest
 * backtest report that the forecaster is worse than doing nothing.
 *
 * The number of customers who walk in wanting one particular item on one
 * particular day is a count of independent arrivals, which is what a Poisson
 * distribution describes - and it is the distribution the intermittent-demand
 * literature assumes for exactly this reason. It gives 0, 1, 2 and the
 * occasional 3 around a mean of one, and it gives a genuine zero most days
 * around a mean of 0.3, while keeping the long-run average intact.
 *
 * Knuth's method: multiply uniforms until the product falls below e^-lambda.
 * It costs about lambda iterations, which is nothing at the rates here.
 */
const poissonSample = (lambda, random) => {
  if (!(lambda > 0)) return 0;

  const limit = Math.exp(-lambda);
  let count = 0;
  let product = random();

  while (product > limit && count < 1000) {
    count += 1;
    product *= random();
  }

  return count;
};

/**
 * Plausible daily unit sales for a product at a given price, as [low, high].
 *
 * Without price, demand is assigned purely by a hash of the SKU, so an 88,000
 * workstation is as likely to sell thirty a day as a 200 cable. In an
 * electronics shop the spread is the whole shape of the business: accessories
 * move constantly at thin absolute margin, big-ticket items move rarely and
 * carry the revenue. Getting that wrong makes ABC analysis, dead stock and the
 * reorder plan all describe a shop that could not exist.
 *
 * A band rather than a multiplier on some independent rate, because a
 * multiplier compounds two random draws and the tails run away: a fast-mover
 * roll on a cheap item produced fifty cables a day, a slow-mover roll on a
 * laptop produced three sales in six months - neither is a shop, and the
 * second is worse, because under ten selling days the backtest refuses to
 * score the product at all and the Forecast page goes quiet.
 *
 * Bands rather than a smooth curve, because the real thing is lumpy too -
 * there is a genuine behavioural gap between an impulse buy and a purchase
 * someone thinks about for a week.
 */
const priceDemandBand = (sellingPrice) => {
  const price = Number(sellingPrice) || 0;

  // No price given - the legacy path, used by the grocery seeder and the
  // generator's own tests. Deliberately wide, because without price the only
  // source of variety left is the SKU hash, and a narrow band there produces a
  // flat catalogue where every product sells about the same amount.
  if (price <= 0) return [0.4, 14];
  if (price <= 500) return [7, 22]; // impulse buys at the counter
  if (price <= 2000) return [3, 9];
  if (price <= 8000) return [1.2, 4];
  if (price <= 25000) return [0.5, 1.6];
  if (price <= 60000) return [0.3, 0.8];
  return [0.15, 0.45]; // considered purchases - a couple a week at most
};

/**
 * A product's demand profile, derived deterministically from its SKU.
 *
 * @param {string} sku
 * @param {{sellingPrice?: number}} [options] when given, sets volume by price
 * @returns {{baseRate: number, trend: string, trendStrength: number, volatility: number, spikeChance: number}}
 */
const profileFor = (sku, { sellingPrice } = {}) => {
  const random = createRandom(hashString(sku));

  const [low, high] = priceDemandBand(sellingPrice);

  // Where in the band this product sits, then a long tail on top: a few
  // products are the ones people come in for, a few barely move. A uniform
  // distribution would make ABC analysis and dead-stock detection meaningless.
  const withinBand = low + random() * (high - low);

  const roll = random();
  const tailFactor = roll > 0.9 ? 1.6 : roll < 0.35 ? 0.55 : 1;

  // Floored rather than allowed to reach zero: an expensive item should sell
  // rarely, not never, or every laptop lands in dead stock on day one.
  const baseRate = Math.max(0.08, withinBand * tailFactor);

  return {
    baseRate: Number(baseRate.toFixed(3)),
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
 * @param {{sellingPrice?: number}} [options]
 * @returns {Array<{dayOffset: number, quantity: number, isSpike: boolean}>}
 *          dayOffset counts back from today: `days` is the oldest day, 1 is yesterday.
 */
const generateDailyDemand = (sku, days, options = {}) => {
  const profile = profileFor(sku, options);
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

    // Whole units, drawn as a count rather than rounded. See poissonSample.
    const quantity = poissonSample(expected, random);

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
const generateRestocks = (
  sku,
  sales,
  days,
  { startingStock = 0, coverDays = 21, sellingPrice } = {}
) => {
  const random = createRandom(hashString(`${sku}:restock`));
  // Must use the same profile the sales were generated from, or restocking is
  // sized for a demand rate the shop does not actually have.
  const profile = profileFor(sku, { sellingPrice });

  const restocks = [];
  let stock = startingStock;

  /**
   * A floor on the delivery size, so a slow seller is not restocked one unit
   * at a time - but a price-aware floor. Ten is a sensible minimum carton of
   * cables and an absurd minimum order of 88,000 workstations: it would put
   * nearly a million rupees of stock on the shelf for a product that sells one
   * a fortnight, and every capital-tied-up figure in the reports would be
   * wrong.
   */
  const price = Number(sellingPrice) || 0;
  const minCover = price > 25000 ? 3 : price > 8000 ? 5 : 10;

  const targetCover = Math.max(minCover, Math.ceil(profile.baseRate * coverDays));

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
  priceDemandBand,
  poissonSample,
  profileFor,
  generateDailyDemand,
  generateRestocks,
  WEEKDAY_FACTORS,
};
