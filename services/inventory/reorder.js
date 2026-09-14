/**
 * Reorder point and safety stock.
 *
 * The old heuristic in stockRecommendation.js targeted "30 days of average
 * demand" for every product. That treats a steady seller and an erratic one
 * identically, which is wrong in both directions: it over-buys the predictable
 * item and still runs out of the volatile one.
 *
 * The textbook formulation instead sizes the buffer to uncertainty:
 *
 *   safety stock   = z * sigma_d * sqrt(L)
 *   reorder point  = mu_d * L + safety stock
 *   order-up-to    = mu_d * (L + R) + safety stock
 *
 *   mu_d    mean daily demand
 *   sigma_d standard deviation of daily demand
 *   L       supplier lead time in days
 *   R       review period - how often you actually place orders
 *   z       service-level factor (how often you are willing to stock out)
 *
 * The sqrt(L) is the part worth understanding: demand over a lead time is the
 * sum of L independent daily draws, and the standard deviation of a sum grows
 * with the square root of the count, not linearly. Using L instead of sqrt(L)
 * is the most common way this gets implemented wrong, and it roughly doubles
 * the capital tied up at a 7-day lead time.
 */

/** Service level -> z. 95% is the usual retail default. */
const SERVICE_LEVEL_Z = Object.freeze({
  0.9: 1.2816,
  0.95: 1.6449,
  0.98: 2.0537,
  0.99: 2.3263,
});

const DEFAULT_SERVICE_LEVEL = 0.95;
const DEFAULT_REVIEW_PERIOD_DAYS = 7;

const round = (value) => Number(value.toFixed(2));

/**
 * @param {object} input
 * @param {number} input.meanDailyDemand
 * @param {number} input.demandStdDev
 * @param {number} input.leadTimeDays
 * @param {number} input.currentStock
 * @param {number} [input.serviceLevel]
 * @param {number} [input.reviewPeriodDays]
 */
const calculateReorderPolicy = ({
  meanDailyDemand,
  demandStdDev,
  leadTimeDays,
  currentStock,
  serviceLevel = DEFAULT_SERVICE_LEVEL,
  reviewPeriodDays = DEFAULT_REVIEW_PERIOD_DAYS,
}) => {
  const z = SERVICE_LEVEL_Z[serviceLevel] ?? SERVICE_LEVEL_Z[DEFAULT_SERVICE_LEVEL];

  const mu = Math.max(0, Number(meanDailyDemand) || 0);
  const sigma = Math.max(0, Number(demandStdDev) || 0);
  const lead = Math.max(0, Number(leadTimeDays) || 0);
  const stock = Math.max(0, Number(currentStock) || 0);

  const safetyStock = z * sigma * Math.sqrt(lead);
  const leadTimeDemand = mu * lead;
  const reorderPoint = leadTimeDemand + safetyStock;
  const orderUpToLevel = mu * (lead + reviewPeriodDays) + safetyStock;

  const shouldReorder = stock <= reorderPoint;
  const suggestedQuantity = shouldReorder ? Math.max(0, Math.ceil(orderUpToLevel - stock)) : 0;

  // Days of cover left at the current rate. Infinite when nothing is selling -
  // reported as null rather than Infinity so it serialises and sorts sanely.
  const daysOfCover = mu > 0 ? stock / mu : null;

  // How long until stock hits the reorder point, which is the number a human
  // actually acts on: "order this within four days".
  const daysUntilReorderPoint =
    mu > 0 ? Math.max(0, (stock - reorderPoint) / mu) : null;

  let urgency;
  if (stock === 0 && mu > 0) urgency = "OUT_OF_STOCK";
  else if (mu === 0) urgency = "NO_DEMAND";
  else if (stock <= leadTimeDemand) urgency = "URGENT"; // will run out before stock arrives
  else if (shouldReorder) urgency = "REORDER_NOW";
  else if (daysUntilReorderPoint !== null && daysUntilReorderPoint <= 3) urgency = "REORDER_SOON";
  else urgency = "HEALTHY";

  return {
    urgency,
    shouldReorder,
    suggestedQuantity,
    reorderPoint: round(reorderPoint),
    safetyStock: round(safetyStock),
    leadTimeDemand: round(leadTimeDemand),
    orderUpToLevel: round(orderUpToLevel),
    daysOfCover: daysOfCover === null ? null : round(daysOfCover),
    daysUntilReorderPoint:
      daysUntilReorderPoint === null ? null : round(daysUntilReorderPoint),
    inputs: {
      meanDailyDemand: round(mu),
      demandStdDev: round(sigma),
      leadTimeDays: lead,
      currentStock: stock,
      serviceLevel,
      reviewPeriodDays,
      z,
    },
  };
};

/**
 * Plain-English reason, generated deterministically.
 *
 * Written here rather than by the model on purpose: this sentence states
 * numbers, and numbers are the one thing an LLM must never be the source of.
 * Gemini's job in this feature is the commentary in the weekly briefing, not
 * the arithmetic. (Same principle the existing stockRecommendation.js follows.)
 */
const explainPolicy = (policy, productName) => {
  const { urgency, inputs, reorderPoint, safetyStock, daysOfCover, suggestedQuantity } = policy;

  switch (urgency) {
    case "NO_DEMAND":
      return `${productName} has not sold recently, so there is nothing to reorder against.`;
    case "OUT_OF_STOCK":
      return `${productName} is out of stock and still selling about ${inputs.meanDailyDemand} a day. Order ${suggestedQuantity}.`;
    case "URGENT":
      return `${productName} has ${inputs.currentStock} left but needs ${policy.leadTimeDemand} to cover the ${inputs.leadTimeDays}-day lead time. It will run out before a new order arrives.`;
    case "REORDER_NOW":
      return `${productName} is at ${inputs.currentStock}, on or below its reorder point of ${reorderPoint} (${policy.leadTimeDemand} to cover lead time plus ${safetyStock} safety stock). Order ${suggestedQuantity}.`;
    case "REORDER_SOON":
      return `${productName} has about ${daysOfCover} days of cover and reaches its reorder point in ${policy.daysUntilReorderPoint} days.`;
    default:
      return `${productName} has about ${daysOfCover} days of cover, comfortably above its reorder point of ${reorderPoint}.`;
  }
};

module.exports = {
  SERVICE_LEVEL_Z,
  DEFAULT_SERVICE_LEVEL,
  DEFAULT_REVIEW_PERIOD_DAYS,
  calculateReorderPolicy,
  explainPolicy,
};
