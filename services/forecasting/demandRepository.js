const mongoose = require("mongoose");
const StockMovement = require("../../models/StockMovements");
const Product = require("../../models/Product");
const Supplier = require("../../models/Supplier");
const { toDailySeries, mean, standardDeviation } = require("./timeSeries");

/**
 * The bridge between the ledger and the maths.
 *
 * Everything in forecast.js, reorder.js and detect.js is pure and takes plain
 * arrays; this module is the only place that knows about Mongo. Keeping that
 * line sharp is what lets the numbers be unit-tested without a database.
 */

const DEFAULT_LOOKBACK_DAYS = 180;

// UTC, to agree with services/forecasting/timeSeries.js and with the
// $dateToString grouping below - see the note there.
const daysAgo = (days) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

/**
 * Daily sales quantities for one product.
 *
 * The series is padded to the full lookback window rather than starting at the
 * first sale, so a product that sold nothing for its first two months is
 * correctly seen as a slow mover rather than as a recent arrival.
 */
const getProductDemandSeries = async (productId, lookbackDays = DEFAULT_LOOKBACK_DAYS) => {
  const from = daysAgo(lookbackDays);
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);

  const movements = await StockMovement.find({
    product: productId,
    type: "SALE",
    createdAt: { $gte: from },
  })
    .select("quantity createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const rows = movements.map((movement) => ({
    date: movement.createdAt,
    quantity: movement.quantity,
  }));

  // An explicit range means "no sales" produces a run of zeros rather than an
  // empty series, which is a different and more useful statement.
  return toDailySeries(rows.length > 0 ? rows : [{ date: from, quantity: 0 }], { from, to });
};

/** The same, for every product at once - one aggregation rather than N queries. */
const getAllDemandSeries = async (lookbackDays = DEFAULT_LOOKBACK_DAYS) => {
  const from = daysAgo(lookbackDays);
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);

  const rows = await StockMovement.aggregate([
    { $match: { type: "SALE", createdAt: { $gte: from } } },
    {
      $group: {
        _id: {
          product: "$product",
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        },
        quantity: { $sum: "$quantity" },
      },
    },
    { $sort: { "_id.day": 1 } },
  ]);

  const byProduct = new Map();

  for (const row of rows) {
    const key = String(row._id.product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push({ date: row._id.day, quantity: row.quantity });
  }

  const series = new Map();
  for (const [productId, productRows] of byProduct) {
    series.set(productId, toDailySeries(productRows, { from, to }));
  }

  return series;
};

/**
 * Lead time: days from placing an order to the stock arriving.
 *
 * Taken from the supplier who last delivered each product - their configured
 * leadTimeDays - or 7 days where no supplier has delivered it yet.
 *
 * An earlier version preferred an "observed" lead time: the median gap between
 * one delivery and the next. That measures how often the shop reorders, not
 * how long an order takes to arrive - this system records deliveries, not
 * order dates, so order-to-arrival time is simply not in the data. A cable
 * restocked every three weeks came out with a 24-day lead time against its
 * supplier's 7, the Forecast page and the Reorder Plan disagreed about the same
 * product, and the reorder point for every steady seller was inflated to cover
 * a wait that never happens.
 */
const DEFAULT_LEAD_TIME_DAYS = 7;

const defaultLeadTime = () => ({
  leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
  source: "default",
  supplierName: null,
});

/**
 * Lead times for many products in two queries, not one per product.
 *
 * @param {Array<string|mongoose.Types.ObjectId>} [productIds] omit for every product
 * @returns {Promise<Map<string, {leadTimeDays: number, source: string, supplierName: string|null}>>}
 *          products with no delivering supplier are absent - use leadTimeFrom()
 */
const getLeadTimesForProducts = async (productIds) => {
  const match = { type: "PURCHASE", supplier: { $ne: null } };
  if (productIds) {
    match.product = { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
  }

  const latest = await StockMovement.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$product", supplier: { $first: "$supplier" } } },
  ]);

  const suppliers = await Supplier.find({ _id: { $in: latest.map((row) => row.supplier) } })
    .select("name leadTimeDays")
    .lean();
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));

  const leadTimes = new Map();
  for (const row of latest) {
    const supplier = supplierById.get(String(row.supplier));
    if (supplier && Number.isFinite(supplier.leadTimeDays)) {
      leadTimes.set(String(row._id), {
        leadTimeDays: supplier.leadTimeDays,
        source: "supplier",
        supplierName: supplier.name,
      });
    }
  }

  return leadTimes;
};

/** One product's entry from getLeadTimesForProducts, or the default. */
const leadTimeFrom = (leadTimes, productId) => leadTimes.get(String(productId)) ?? defaultLeadTime();

const getLeadTimeForProduct = async (productId) =>
  leadTimeFrom(await getLeadTimesForProducts([productId]), productId);

/** Summary statistics a reorder policy needs, from a demand series. */
const demandStatistics = (series, { recentDays = 60 } = {}) => {
  const values = series?.values ?? [];

  // Recent demand, not all-time: a product's rate six months ago should not set
  // today's reorder point.
  const recent = values.slice(-recentDays);

  return {
    meanDailyDemand: mean(recent),
    demandStdDev: standardDeviation(recent),
    observations: recent.length,
    totalRecent: recent.reduce((sum, value) => sum + value, 0),
  };
};

/** Sales joined to their product's list price - the input to discount detection. */
const getSalesWithListPrice = async (lookbackDays = 30) => {
  const from = daysAgo(lookbackDays);

  return StockMovement.aggregate([
    { $match: { type: "SALE", createdAt: { $gte: from } } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: "product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: "$productDoc" },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "actorDoc",
      },
    },
    {
      $project: {
        movementId: "$_id",
        date: "$createdAt",
        quantity: 1,
        unitPrice: 1,
        sellingPrice: "$productDoc.sellingPrice",
        product: { id: "$productDoc._id", name: "$productDoc.name", sku: "$productDoc.sku" },
        actor: {
          $cond: [
            { $gt: [{ $size: "$actorDoc" }, 0] },
            {
              id: { $arrayElemAt: ["$actorDoc._id", 0] },
              name: { $arrayElemAt: ["$actorDoc.name", 0] },
              email: { $arrayElemAt: ["$actorDoc.email", 0] },
            },
            null,
          ],
        },
      },
    },
    { $sort: { date: -1 } },
  ]);
};

/**
 * Per-staff-account behaviour, for peer comparison.
 *
 * Only accounts with a meaningful number of sales are included - comparing
 * someone's two transactions against a colleague's four hundred produces noise,
 * not signal.
 */
const getActorStatistics = async (lookbackDays = 30, { minSales = 5 } = {}) => {
  const sales = await getSalesWithListPrice(lookbackDays);
  const byActor = new Map();

  for (const sale of sales) {
    if (!sale.actor?.id) continue;

    const key = String(sale.actor.id);
    if (!byActor.has(key)) {
      byActor.set(key, {
        id: key,
        name: sale.actor.name,
        email: sale.actor.email,
        sales: 0,
        discountedSales: 0,
        discountPercentTotal: 0,
        activeDays: new Set(),
      });
    }

    const actor = byActor.get(key);
    actor.sales += 1;
    actor.activeDays.add(new Date(sale.date).toISOString().slice(0, 10));

    const listPrice = Number(sale.sellingPrice || 0);
    if (listPrice > 0 && sale.unitPrice < listPrice) {
      actor.discountedSales += 1;
      actor.discountPercentTotal += ((listPrice - sale.unitPrice) / listPrice) * 100;
    }
  }

  return [...byActor.values()]
    .filter((actor) => actor.sales >= minSales)
    .map((actor) => ({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      sales: actor.sales,
      activeDays: actor.activeDays.size,
      discountRate: (actor.discountedSales / actor.sales) * 100,
      averageDiscountPercent:
        actor.discountedSales > 0 ? actor.discountPercentTotal / actor.discountedSales : 0,
      salesPerActiveDay: actor.activeDays.size > 0 ? actor.sales / actor.activeDays.size : 0,
    }));
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = {
  DEFAULT_LOOKBACK_DAYS,
  daysAgo,
  getProductDemandSeries,
  getAllDemandSeries,
  getLeadTimeForProduct,
  getLeadTimesForProducts,
  leadTimeFrom,
  DEFAULT_LEAD_TIME_DAYS,
  demandStatistics,
  getSalesWithListPrice,
  getActorStatistics,
  isValidId,
};
