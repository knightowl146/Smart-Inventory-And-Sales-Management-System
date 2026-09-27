const {
  createRandom,
  hashString,
  generateDailyDemand,
  restockPolicyFor,
} = require("./demandGenerator");

/**
 * Filling the days a demo shop sat unattended.
 *
 * The seeded history ends on the day it was generated. Leave the app for a
 * week and the dashboard shows a week of nothing, the forecaster reads a sudden
 * collapse in demand, and the anomaly feed flags every product at once. This
 * fills those days with trading that continues the same pattern, without
 * touching anything that already happened.
 *
 * Kept free of the database on purpose: every decision below is testable
 * without Mongo, and the script that calls this only does the reading and
 * writing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar day, matching $dateToString in the analytics aggregations. */
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const addDaysToKey = (key, days) => dayKey(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS);

/**
 * Shop hours, in the local time of the machine running the fill. Only used for
 * today: the share of a normal day's trading that would have happened by now.
 */
const SHOP_OPENS = 10;
const SHOP_CLOSES = 21;

/**
 * Today, pro-rated to the moment the fill runs.
 *
 * Past days get their whole generated quantity. Today is not over, and nothing
 * may be written with a time still in the future - so today gets the fraction
 * of its generated sales that the shop would have made by now, timestamped
 * inside the hours already gone. Run at 6 pm that is about three-quarters of a
 * day; run after closing it is all of it; run before opening it is nothing.
 */
const proRateToday = (sale, now) => {
  const opens = new Date(sale.date);
  opens.setHours(SHOP_OPENS, 0, 0, 0);
  const closes = new Date(sale.date);
  closes.setHours(SHOP_CLOSES, 0, 0, 0);

  const until = Math.min(now.getTime(), closes.getTime());
  const fraction = Math.max(0, Math.min(1, (until - opens.getTime()) / (closes - opens)));
  const quantity = Math.round(sale.quantity * fraction);

  if (quantity <= 0) return null;

  // Midway through the hours so far: always in the past, always in trading hours.
  return { ...sale, quantity, date: new Date(opens.getTime() + (until - opens.getTime()) / 2) };
};

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Which days count as missing.
 *
 * Not simply "days after the last movement": a few sales recorded by hand
 * while testing the live site would make the gap look closed when the shop
 * was, to every chart, still empty. A day is a gap when it has almost no
 * trading compared with a normal day - under a tenth of the median. Real quiet
 * days in this catalogue never get close to that; a day with two test sales on
 * it is nowhere near a normal one.
 *
 * @param {Map<string, number>} salesPerDay dayKey -> number of SALE movements
 * @param {string} fromKey first day of history
 * @param {string} toKey last day to consider (yesterday)
 * @returns {string[]} gap days, oldest first
 */
const findGapDays = (salesPerDay, fromKey, toKey) => {
  const normal = median([...salesPerDay.values()].filter((count) => count > 0));
  const threshold = Math.max(1, normal * 0.1);

  const gaps = [];
  for (let key = fromKey; key <= toKey; key = addDaysToKey(key, 1)) {
    if ((salesPerDay.get(key) ?? 0) < threshold) gaps.push(key);
  }

  return gaps;
};

/**
 * Plan the catch-up for one product.
 *
 * Generated sales come from the same seeded generator as the original history,
 * over the same span, so a product keeps its own rate, weekly shape and trend
 * across the join instead of restarting. Only the gap days are kept.
 *
 * Existing movements inside the window are kept exactly as they are - they
 * happened - and are replayed alongside the new ones so prevQuantity and
 * newQuantity still chain in time order across the whole window.
 *
 * @param {object} args
 * @param {{_id: *, sku: string, sellingPrice: number, purchasePrice: number, quantity: number}} args.product
 * @param {string[]} args.gapDays from findGapDays
 * @param {string} args.historyStartKey first day of the shop's history
 * @param {Array<{_id: *, type: string, quantity: number, createdAt: Date, prevQuantity: number, newQuantity: number}>} args.existing
 *        this product's movements from the first gap day onwards
 * @param {Date} [args.now]
 * @returns {{created: Array, updates: Array, finalStock: number, openingStock: number, skippedSales: number}}
 */
const planCatchup = ({ product, gapDays, historyStartKey, existing = [], now = new Date() }) => {
  const gapSet = new Set(gapDays);
  if (gapDays.length === 0) {
    return { created: [], updates: [], finalStock: product.quantity, openingStock: product.quantity, skippedSales: 0 };
  }

  /**
   * Stock on the morning the gap began, worked back from the product's current
   * figure rather than read from the ledger. product.quantity is what the rest
   * of the app treats as the truth, so starting from it guarantees the two
   * still agree when this finishes.
   */
  const netSinceGap = existing.reduce(
    (total, movement) => total + (movement.type === "PURCHASE" ? movement.quantity : -movement.quantity),
    0
  );
  const openingStock = Math.max(0, product.quantity - netSinceGap);

  // Same span as the original history, so the random stream lines up with it.
  const todayKey = dayKey(now);
  const days = Math.round(
    (new Date(`${todayKey}T00:00:00Z`) - new Date(`${historyStartKey}T00:00:00Z`)) / DAY_MS
  );

  const includeToday = gapSet.has(todayKey);

  const generated = generateDailyDemand(product.sku, days, {
    sellingPrice: product.sellingPrice,
    includeToday,
  })
    .filter((sale) => gapSet.has(dayKey(sale.date)))
    .map((sale) => (dayKey(sale.date) === todayKey ? proRateToday(sale, now) : sale))
    .filter((sale) => sale && sale.date < now)
    .map((sale) => ({ type: "SALE", quantity: sale.quantity, createdAt: sale.date, generated: true }));

  const kept = existing.map((movement) => ({ ...movement, generated: false }));

  const events = [...generated, ...kept].sort((a, b) => a.createdAt - b.createdAt);

  const { targetCover, reorderLevel } = restockPolicyFor(product.sku, {
    sellingPrice: product.sellingPrice,
  });

  // Seeded by product and gap, so re-planning the same gap gives the same
  // deliveries, and a later gap gets its own.
  const random = createRandom(hashString(`${product.sku}:catchup:${gapDays[0]}`));

  const created = [];
  const updates = [];
  let stock = openingStock;
  let skippedSales = 0;

  for (const event of events) {
    if (event.type === "SALE" && stock - event.quantity < reorderLevel) {
      // Delivered that morning, a few hours before the sale that needed it.
      const deliveredAt = new Date(event.createdAt.getTime() - 3 * 60 * 60 * 1000);
      // Normally a standard delivery. Sized up when a single real sale is bigger
      // than that - a bulk order someone recorded by hand - since that sale
      // happened and the ledger has to be able to show where the stock came from.
      const standard = targetCover + Math.round(random() * targetCover * 0.3);
      const quantity = Math.max(standard, event.quantity - stock + reorderLevel);

      created.push({
        type: "PURCHASE",
        quantity,
        createdAt: deliveredAt,
        prevQuantity: stock,
        newQuantity: stock + quantity,
      });
      stock += quantity;
    }

    if (event.type === "SALE" && event.generated && stock < event.quantity) {
      // Never write a sale the shop could not have made.
      skippedSales += 1;
      continue;
    }

    const prevQuantity = stock;
    stock += event.type === "PURCHASE" ? event.quantity : -event.quantity;
    stock = Math.max(0, stock);

    if (event.generated) {
      created.push({
        type: "SALE",
        quantity: event.quantity,
        createdAt: event.createdAt,
        prevQuantity,
        newQuantity: stock,
      });
    } else if (event.prevQuantity !== prevQuantity || event.newQuantity !== stock) {
      // A real movement keeps its quantity, date and author; only the running
      // stock figures move, because days were inserted before it.
      updates.push({ _id: event._id, prevQuantity, newQuantity: stock });
    }
  }

  created.sort((a, b) => a.createdAt - b.createdAt);

  return { created, updates, finalStock: stock, openingStock, skippedSales };
};

module.exports = { dayKey, addDaysToKey, findGapDays, planCatchup, proRateToday, SHOP_OPENS, SHOP_CLOSES };
