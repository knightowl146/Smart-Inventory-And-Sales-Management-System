const Product = require("../models/Product");
const { forecastDemand } = require("../services/forecasting/forecast");
const { backtest } = require("../services/forecasting/backtest");
const {
  getProductDemandSeries,
  getAllDemandSeries,
  getLeadTimeForProduct,
  demandStatistics,
  isValidId,
} = require("../services/forecasting/demandRepository");
const {
  calculateReorderPolicy,
  explainPolicy,
  DEFAULT_SERVICE_LEVEL,
} = require("../services/inventory/reorder");
const {
  buildReorderPlan,
  DEFAULT_LOOKBACK_DAYS: REORDER_LOOKBACK_DAYS,
} = require("../services/inventory/reorderPlan");

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
};

//<---------------- GET /api/analytics/forecast/:productId ---------------->
const getProductForecast = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!isValidId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const horizon = parsePositiveInt(req.query.horizon, 30, 90);
    const lookback = parsePositiveInt(req.query.lookback, 180, 730);

    const series = await getProductDemandSeries(productId, lookback);
    const forecast = forecastDemand(series, horizon);
    const accuracy = backtest(series);
    const stats = demandStatistics(series);
    const leadTime = await getLeadTimeForProduct(productId);

    const policy = calculateReorderPolicy({
      meanDailyDemand: stats.meanDailyDemand,
      demandStdDev: stats.demandStdDev,
      leadTimeDays: leadTime.leadTimeDays,
      currentStock: product.quantity,
    });

    return res.status(200).json({
      success: true,
      data: {
        product: {
          id: product._id,
          name: product.name,
          sku: product.sku,
          currentStock: product.quantity,
        },
        forecast,
        // Null when there is not enough history to score honestly. The UI shows
        // "not enough history" rather than an invented number.
        accuracy,
        reorder: { ...policy, leadTime, explanation: explainPolicy(policy, product.name) },
        // The recent actuals, so a chart can show forecast against history and a
        // reader can judge the fit rather than take it on trust.
        history: series.dates
          .map((date, index) => ({ date, actual: series.values[index] }))
          .slice(-90),
      },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/analytics/reorder-plan ---------------->
/**
 * What to buy, ranked. The page an owner opens on a Monday morning.
 */
const getReorderPlan = async (req, res, next) => {
  try {
    const serviceLevel = Number(req.query.serviceLevel) || DEFAULT_SERVICE_LEVEL;
    const lookbackDays = parsePositiveInt(req.query.lookback, REORDER_LOOKBACK_DAYS, 730);

    const plan = await buildReorderPlan({ serviceLevel, lookbackDays });

    return res.status(200).json({ success: true, data: plan });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/analytics/forecast-accuracy ---------------->
/**
 * How good is the forecast, across the catalogue?
 *
 * This is the number that separates a forecast from a decoration. It is
 * computed by holding out the last 30 days from every product with enough
 * history and scoring the model against two free baselines - so it is a real
 * out-of-sample measurement, not a fit statistic.
 */
const getForecastAccuracy = async (req, res, next) => {
  try {
    const lookback = parsePositiveInt(req.query.lookback, 365, 730);

    const [products, allSeries] = await Promise.all([
      Product.find().select("name sku").lean(),
      getAllDemandSeries(lookback),
    ]);

    const scored = [];
    let skipped = 0;

    for (const product of products) {
      const series = allSeries.get(String(product._id));
      const result = series ? backtest(series) : null;

      if (!result) {
        skipped += 1;
        continue;
      }

      scored.push({
        product: { id: product._id, name: product.name, sku: product.sku },
        ...result,
      });
    }

    if (scored.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          evaluated: 0,
          skippedForInsufficientHistory: skipped,
          message:
            "No product has enough sales history to score a forecast yet. About 50 days of data per product is the minimum.",
          products: [],
        },
      });
    }

    const average = (pick) => {
      const values = scored.map(pick).filter((value) => value !== null && Number.isFinite(value));
      if (values.length === 0) return null;
      return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
    };

    return res.status(200).json({
      success: true,
      data: {
        evaluated: scored.length,
        skippedForInsufficientHistory: skipped,
        holdoutDays: 30,
        overall: {
          mae: average((row) => row.model.mae),
          rmse: average((row) => row.model.rmse),
          smape: average((row) => row.model.smape),
        },
        baselines: {
          naive: { mae: average((row) => row.baselines.naive.mae) },
          seasonalNaive: { mae: average((row) => row.baselines.seasonalNaive.mae) },
        },
        beatsBaselineCount: scored.filter((row) => row.beatsBaseline).length,
        beatsBaselinePercent: Number(
          ((scored.filter((row) => row.beatsBaseline).length / scored.length) * 100).toFixed(1)
        ),

        /**
         * The same verdict split by method, because one headline percentage
         * hides the interesting part: smooth demand and intermittent demand
         * are forecast by different methods and scored on different criteria,
         * and averaging them together says less than either number alone.
         */
        byMethod: Object.entries(
          scored.reduce((groups, row) => {
            const group = groups[row.method] ?? { evaluated: 0, wins: 0, criterion: row.criterion };
            group.evaluated += 1;
            if (row.beatsBaseline) group.wins += 1;
            groups[row.method] = group;
            return groups;
          }, {})
        ).map(([method, group]) => ({
          method,
          criterion: group.criterion,
          evaluated: group.evaluated,
          wins: group.wins,
          winPercent: Number(((group.wins / group.evaluated) * 100).toFixed(1)),
        })),
        products: scored
          .sort((a, b) => (a.model.smape ?? 999) - (b.model.smape ?? 999))
          .slice(0, 50),
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getProductForecast, getReorderPlan, getForecastAccuracy };
