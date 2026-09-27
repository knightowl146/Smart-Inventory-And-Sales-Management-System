const Product = require("../../models/Product");
const {
  getAllDemandSeries,
  getLeadTimesForProducts,
  leadTimeFrom,
  demandStatistics,
  DEFAULT_LEAD_TIME_DAYS,
} = require("../forecasting/demandRepository");
const { calculateReorderPolicy, explainPolicy, DEFAULT_SERVICE_LEVEL } = require("./reorder");

/**
 * The reorder plan: what to buy, ranked by urgency.
 *
 * Built in one place and used by the Reorder Plan page, the assistant's
 * get_reorder_suggestions lookup and the weekly briefing. They used to build it
 * three times, with a 7-day lead time in two of them, an average of every
 * supplier's in the third, and a different history window again on the
 * Forecast page - so the same product could be "urgent" on one screen and fine
 * on the next. Now every product uses its own supplier's lead time and the same
 * 180 days of demand everywhere.
 */

const DEFAULT_LOOKBACK_DAYS = 180;

const URGENCY_RANK = {
  OUT_OF_STOCK: 0,
  URGENT: 1,
  REORDER_NOW: 2,
  REORDER_SOON: 3,
  HEALTHY: 4,
  NO_DEMAND: 5,
};

/**
 * @param {object} [options]
 * @param {number} [options.serviceLevel]
 * @param {number} [options.lookbackDays]
 * @returns {Promise<{assumptions: object, summary: object, rows: Array}>}
 */
const buildReorderPlan = async ({
  serviceLevel = DEFAULT_SERVICE_LEVEL,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
} = {}) => {
  const [products, allSeries, leadTimes] = await Promise.all([
    Product.find().select("name sku quantity lowStockThreshold purchasePrice sellingPrice").lean(),
    getAllDemandSeries(lookbackDays),
    getLeadTimesForProducts(),
  ]);

  const rows = products.map((product) => {
    const series = allSeries.get(String(product._id)) ?? { dates: [], values: [] };
    const stats = demandStatistics(series);
    const leadTime = leadTimeFrom(leadTimes, product._id);

    const policy = calculateReorderPolicy({
      meanDailyDemand: stats.meanDailyDemand,
      demandStdDev: stats.demandStdDev,
      leadTimeDays: leadTime.leadTimeDays,
      currentStock: product.quantity,
      serviceLevel,
    });

    return {
      product: {
        id: product._id,
        name: product.name,
        sku: product.sku,
        currentStock: product.quantity,
        // Owner-only route, but responseFilter would strip this anyway if the
        // permission table ever changed underneath us.
        purchasePrice: product.purchasePrice,
      },
      leadTime,
      ...policy,
      explanation: explainPolicy(policy, product.name),
      estimatedCost:
        policy.suggestedQuantity > 0
          ? Number((policy.suggestedQuantity * (product.purchasePrice || 0)).toFixed(2))
          : 0,
    };
  });

  rows.sort((a, b) => {
    const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (byUrgency !== 0) return byUrgency;
    return b.estimatedCost - a.estimatedCost;
  });

  const needsOrder = rows.filter((row) => row.suggestedQuantity > 0);
  const fromSupplier = rows.filter((row) => row.leadTime.source === "supplier").length;

  return {
    assumptions: {
      serviceLevel,
      lookbackDays,
      defaultLeadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      productsWithSupplierLeadTime: fromSupplier,
      note:
        "Each product uses the lead time of the supplier who last delivered it " +
        `(${DEFAULT_LEAD_TIME_DAYS} days where none has). Set leadTimeDays on a supplier to change it.`,
    },
    summary: {
      productsReviewed: rows.length,
      needingOrder: needsOrder.length,
      outOfStock: rows.filter((row) => row.urgency === "OUT_OF_STOCK").length,
      urgent: rows.filter((row) => row.urgency === "URGENT").length,
      estimatedTotalCost: Number(needsOrder.reduce((sum, row) => sum + row.estimatedCost, 0).toFixed(2)),
    },
    rows,
  };
};

module.exports = { buildReorderPlan, DEFAULT_LOOKBACK_DAYS, URGENCY_RANK };
