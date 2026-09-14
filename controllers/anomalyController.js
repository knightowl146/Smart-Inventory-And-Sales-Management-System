const Product = require("../models/Product");
const {
  detectVolumeAnomalies,
  detectDiscountAnomalies,
  detectActorAnomalies,
  rankAnomalies,
} = require("../services/anomaly/detect");
const {
  getAllDemandSeries,
  getSalesWithListPrice,
  getActorStatistics,
} = require("../services/forecasting/demandRepository");
const { explainAnomalies } = require("../services/ai/narrator");

//<---------------- GET /api/analytics/anomalies ---------------->
/**
 * The "something looks off" feed.
 *
 * Statistics decide what is anomalous; Gemini, optionally and only if a key is
 * configured, writes a sentence about each one. If the model is unavailable the
 * endpoint still returns every finding with its numbers - the AI is a layer of
 * readability on top of the result, never a dependency of it.
 */
const getAnomalies = async (req, res, next) => {
  try {
    const lookbackDays = Math.min(Number(req.query.days) || 60, 365);
    const explain = req.query.explain !== "false";

    const [products, allSeries, sales, actorStats] = await Promise.all([
      Product.find().select("name sku").lean(),
      getAllDemandSeries(lookbackDays),
      getSalesWithListPrice(Math.min(lookbackDays, 90)),
      getActorStatistics(Math.min(lookbackDays, 90)),
    ]);

    const productNames = new Map(products.map((p) => [String(p._id), p]));

    // ── Volume: each product against its own baseline ──────────────────────
    const volume = [];
    for (const [productId, series] of allSeries) {
      const product = productNames.get(productId);
      if (!product) continue;

      for (const anomaly of detectVolumeAnomalies(series)) {
        volume.push({
          ...anomaly,
          product: { id: productId, name: product.name, sku: product.sku },
        });
      }
    }

    // ── Discounting: sales recorded below the list price ───────────────────
    const discount = detectDiscountAnomalies(
      sales.map((sale) => ({
        date: new Date(sale.date).toISOString().slice(0, 10),
        movementId: sale.movementId,
        product: sale.product,
        actor: sale.actor,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        sellingPrice: sale.sellingPrice,
      }))
    );

    // ── Staff: one account unlike its peers ────────────────────────────────
    const actor = detectActorAnomalies(actorStats);

    const all = rankAnomalies([...volume, ...discount, ...actor]);
    const top = all.slice(0, 50);

    const narratives = explain ? await explainAnomalies(top.slice(0, 10)) : {};

    return res.status(200).json({
      success: true,
      data: {
        window: { days: lookbackDays },
        summary: {
          total: all.length,
          critical: all.filter((a) => a.severity === "critical").length,
          high: all.filter((a) => a.severity === "high").length,
          byType: {
            volume: volume.length,
            discount: discount.length,
            actor: actor.length,
          },
        },
        // The narrative sits beside the numbers it was written from, never
        // instead of them.
        anomalies: top.map((anomaly, index) => ({
          ...anomaly,
          narrative: narratives[index] ?? null,
        })),
        staffComparison: actorStats.map((stats) => ({
          ...stats,
          discountRate: Number(stats.discountRate.toFixed(2)),
          averageDiscountPercent: Number(stats.averageDiscountPercent.toFixed(2)),
          salesPerActiveDay: Number(stats.salesPerActiveDay.toFixed(2)),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getAnomalies };
