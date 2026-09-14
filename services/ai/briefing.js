const Product = require("../../models/Product");
const StockMovement = require("../../models/StockMovements");
const Briefing = require("../../models/Briefing");
const { generateJson, isConfigured } = require("./client");
const { calculateReorderPolicy } = require("../inventory/reorder");
const { getAllDemandSeries, demandStatistics } = require("../forecasting/demandRepository");

/**
 * The weekly briefing.
 *
 * Every figure below is computed in Node. The model receives those figures and
 * writes prose about them - it is a narrator, not an analyst. If it is
 * unavailable the same figures are assembled into a plainer summary by
 * `deterministicBriefing`, so the feature degrades rather than disappears.
 *
 * One call a week, which is why this is cheap enough to leave on.
 */

const money = (value) => Number((value || 0).toFixed(2));

const percentChange = (current, previous) => {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const collectMetrics = async (periodStart, periodEnd) => {
  const windowMs = periodEnd - periodStart;
  const priorStart = new Date(periodStart.getTime() - windowMs);

  const salesIn = async (from, to) => {
    const [row] = await StockMovement.aggregate([
      { $match: { type: "SALE", createdAt: { $gte: from, $lt: to } } },
      {
        $lookup: {
          from: Product.collection.name,
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          cost: { $sum: { $multiply: ["$quantity", "$product.purchasePrice"] } },
          units: { $sum: "$quantity" },
          transactions: { $sum: 1 },
        },
      },
    ]);

    return {
      revenue: money(row?.revenue),
      cost: money(row?.cost),
      grossProfit: money((row?.revenue || 0) - (row?.cost || 0)),
      units: row?.units ?? 0,
      transactions: row?.transactions ?? 0,
    };
  };

  const [current, previous, topProducts, lowStock, products, allSeries] = await Promise.all([
    salesIn(periodStart, periodEnd),
    salesIn(priorStart, periodStart),
    StockMovement.aggregate([
      { $match: { type: "SALE", createdAt: { $gte: periodStart, $lt: periodEnd } } },
      {
        $group: {
          _id: "$product",
          revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          units: { $sum: "$quantity" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: Product.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      { $project: { _id: 0, name: "$product.name", units: 1, revenue: 1 } },
    ]),
    Product.countDocuments({ $expr: { $lte: ["$quantity", "$lowStockThreshold"] } }),
    Product.find().select("name quantity").lean(),
    getAllDemandSeries(90),
  ]);

  const needingReorder = products.filter((product) => {
    const series = allSeries.get(String(product._id)) ?? { dates: [], values: [] };
    const stats = demandStatistics(series);
    const policy = calculateReorderPolicy({
      meanDailyDemand: stats.meanDailyDemand,
      demandStdDev: stats.demandStdDev,
      leadTimeDays: 7,
      currentStock: product.quantity,
    });
    return policy.suggestedQuantity > 0;
  });

  return {
    period: {
      from: periodStart.toISOString().slice(0, 10),
      to: periodEnd.toISOString().slice(0, 10),
    },
    current,
    previous,
    change: {
      revenuePercent: percentChange(current.revenue, previous.revenue),
      unitsPercent: percentChange(current.units, previous.units),
      transactionsPercent: percentChange(current.transactions, previous.transactions),
    },
    marginPercent: current.revenue > 0 ? money((current.grossProfit / current.revenue) * 100) : 0,
    topProducts: topProducts.map((p) => ({ ...p, revenue: money(p.revenue) })),
    lowStockCount: lowStock,
    needingReorderCount: needingReorder.length,
    catalogueSize: products.length,
  };
};

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "highlights", "actions"],
};

const PROMPT = `
You are writing a short weekly briefing for the owner of a small shop, from
figures that have already been calculated. Produce:

  headline    one sentence summarising the week
  highlights  3 to 5 bullets, each a single sentence
  actions     up to 3 concrete things worth doing next week

Hard rules:
- Use ONLY the numbers given. Never compute a new one, never estimate.
- If a figure is null or zero, say so plainly rather than skipping it.
- No greetings, no sign-off, no "as an AI".
- Plain language, no jargon. Amounts without a currency symbol.
- Each bullet under 160 characters.
`.trim();

/** The fallback. Same figures, assembled without a model. */
const deterministicBriefing = (metrics) => {
  const direction =
    metrics.change.revenuePercent === null
      ? "with no prior period to compare against"
      : metrics.change.revenuePercent >= 0
        ? `up ${metrics.change.revenuePercent}% on the week before`
        : `down ${Math.abs(metrics.change.revenuePercent)}% on the week before`;

  const highlights = [
    `Revenue was ${metrics.current.revenue} across ${metrics.current.transactions} sales, ${direction}.`,
    `${metrics.current.units} units sold at a gross margin of ${metrics.marginPercent}%.`,
    metrics.topProducts.length > 0
      ? `The best seller was ${metrics.topProducts[0].name} at ${metrics.topProducts[0].revenue}.`
      : "No sales were recorded in this period.",
    `${metrics.lowStockCount} products are at or below their low-stock threshold.`,
  ];

  const actions = [];
  if (metrics.needingReorderCount > 0) {
    actions.push(`Review the reorder plan - ${metrics.needingReorderCount} products are at or below their reorder point.`);
  }
  if (metrics.lowStockCount > 0) {
    actions.push(`Check the ${metrics.lowStockCount} low-stock items before the weekend.`);
  }
  if (metrics.change.revenuePercent !== null && metrics.change.revenuePercent < -15) {
    actions.push("Revenue fell noticeably; compare against the same week last month to see whether it is seasonal.");
  }

  return {
    headline: `Revenue of ${metrics.current.revenue} this period, ${direction}.`,
    highlights,
    actions,
    source: "deterministic",
  };
};

/**
 * Generate and store a briefing.
 *
 * @param {{days?: number, userId?: string}} [options]
 */
const generateBriefing = async ({ days = 7, userId = null } = {}) => {
  const periodEnd = new Date();
  periodEnd.setHours(0, 0, 0, 0);

  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - days);

  const metrics = await collectMetrics(periodStart, periodEnd);

  let written = null;

  if (isConfigured()) {
    const result = await generateJson({
      prompt: `${PROMPT}\n\nFigures:\n${JSON.stringify(metrics, null, 2)}`,
      responseSchema: BRIEFING_SCHEMA,
      feature: "briefing",
      userId,
      cacheable: false,
    });

    if (result?.headline) {
      written = {
        headline: result.headline,
        highlights: result.highlights ?? [],
        actions: result.actions ?? [],
        source: "ai",
      };
    }
  }

  const content = written ?? deterministicBriefing(metrics);

  return Briefing.create({
    periodStart,
    periodEnd,
    headline: content.headline,
    highlights: content.highlights,
    actions: content.actions,
    metrics,
    source: content.source,
    generatedBy: userId,
  });
};

module.exports = { generateBriefing, collectMetrics, deterministicBriefing, BRIEFING_SCHEMA };
