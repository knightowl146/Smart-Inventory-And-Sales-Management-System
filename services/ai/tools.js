const mongoose = require("mongoose");
const Product = require("../../models/Product");
const StockMovement = require("../../models/StockMovements");
const Customer = require("../../models/Customer");
const Supplier = require("../../models/Supplier");
const { roleHas } = require("../../middlewares/permissions");
const { forecastDemand } = require("../forecasting/forecast");
const {
  getProductDemandSeries,
  demandStatistics,
  getLeadTimeForProduct,
} = require("../forecasting/demandRepository");
const { calculateReorderPolicy } = require("../inventory/reorder");

/**
 * The tools the model is allowed to call.
 *
 * Two decisions define this file.
 *
 * 1. The model never writes a database query. It picks a tool from this fixed
 *    list and fills in typed parameters; the handler beneath is ordinary code
 *    that was reviewed like any other. A model that can emit arbitrary Mongo
 *    can be talked into emitting arbitrary Mongo, and prompt instructions are
 *    not an access control.
 *
 * 2. Every tool carries a `permission`, checked against the *caller's* role
 *    before the handler runs - by the same can()/roleHas() table the HTTP
 *    routes use. So an employee asking "what's our profit margin" is refused by
 *    the authorisation layer, not by a sentence in a prompt. There is no
 *    phrasing that gets around it, because the refusal happens after the model
 *    has already decided and before any data is read.
 *
 * Everything here is read-only. No tool writes, deletes, or changes stock -
 * the model can answer questions about the business, never run it.
 */

const daysAgo = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

const parseRange = ({ from, to, days }) => {
  if (from || to) {
    const start = from ? new Date(from) : daysAgo(30);
    const end = to ? new Date(to) : new Date();
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  const window = Number(days) || 30;
  return { start: daysAgo(window), end: new Date() };
};

const money = (value) => Number((value || 0).toFixed(2));

// Gemini's function-declaration schema dialect (a subset of OpenAPI).
const STRING = { type: "string" };
const NUMBER = { type: "number" };

const RANGE_PROPS = {
  days: { type: "number", description: "Look back this many days from today. Default 30." },
  from: { type: "string", description: "Start date, YYYY-MM-DD. Overrides `days`." },
  to: { type: "string", description: "End date, YYYY-MM-DD." },
};

const TOOLS = [
  {
    name: "get_sales_summary",
    permission: "analytics:read",
    description:
      "Total revenue, units sold and transaction count over a period. Use for questions like 'how did we do last month'.",
    parameters: { type: "object", properties: { ...RANGE_PROPS } },
    handler: async (args) => {
      const { start, end } = parseRange(args);

      const [row] = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            units: { $sum: "$quantity" },
            transactions: { $sum: 1 },
          },
        },
      ]);

      return {
        period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
        revenue: money(row?.revenue),
        unitsSold: row?.units ?? 0,
        transactions: row?.transactions ?? 0,
      };
    },
  },

  {
    name: "get_sales_over_time",
    permission: "analytics:read",
    description:
      "Revenue and units per day, week or month. Use when the question is about a trend, or when a chart would help.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        granularity: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Bucket size. Default day.",
        },
      },
    },
    handler: async (args) => {
      const { start, end } = parseRange(args);
      const formats = { day: "%Y-%m-%d", week: "%Y-W%V", month: "%Y-%m" };
      const format = formats[args.granularity] || formats.day;

      const rows = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format, date: "$createdAt" } },
            revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            units: { $sum: "$quantity" },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 400 },
      ]);

      return {
        granularity: args.granularity || "day",
        series: rows.map((row) => ({
          period: row._id,
          revenue: money(row.revenue),
          units: row.units,
        })),
      };
    },
  },

  {
    name: "get_top_products",
    permission: "analytics:read",
    description: "Best or worst selling products by units or revenue over a period.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        metric: { type: "string", enum: ["units", "revenue"], description: "Default revenue." },
        order: { type: "string", enum: ["top", "bottom"], description: "Default top." },
        limit: { type: "number", description: "How many to return. Default 10, max 50." },
      },
    },
    handler: async (args) => {
      const { start, end } = parseRange(args);
      const metric = args.metric === "units" ? "units" : "revenue";
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const direction = args.order === "bottom" ? 1 : -1;

      const rows = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: "$product",
            revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            units: { $sum: "$quantity" },
          },
        },
        { $sort: { [metric]: direction } },
        { $limit: limit },
        {
          $lookup: {
            from: Product.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            _id: 0,
            name: "$product.name",
            sku: "$product.sku",
            category: "$product.category",
            units: 1,
            revenue: 1,
          },
        },
      ]);

      return { metric, order: args.order || "top", products: rows.map((r) => ({ ...r, revenue: money(r.revenue) })) };
    },
  },

  {
    name: "get_sales_by_category",
    permission: "analytics:read",
    description: "Revenue and units grouped by product category.",
    parameters: { type: "object", properties: { ...RANGE_PROPS } },
    handler: async (args) => {
      const { start, end } = parseRange(args);

      const rows = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end } } },
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
            _id: "$product.category",
            revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            units: { $sum: "$quantity" },
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      return {
        categories: rows.map((row) => ({
          category: row._id,
          revenue: money(row.revenue),
          units: row.units,
        })),
      };
    },
  },

  {
    name: "get_profit_and_loss",
    // The sharpest example of the point: valid question, valid tool, refused
    // for an employee because the permission table says so.
    permission: "finance:read",
    description:
      "Revenue, cost of goods sold, gross profit and margin over a period. Owner only.",
    parameters: { type: "object", properties: { ...RANGE_PROPS } },
    handler: async (args) => {
      const { start, end } = parseRange(args);

      const [row] = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end } } },
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
          },
        },
      ]);

      const revenue = money(row?.revenue);
      const cost = money(row?.cost);
      const grossProfit = money(revenue - cost);

      return {
        period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
        revenue,
        costOfGoodsSold: cost,
        grossProfit,
        marginPercent: revenue > 0 ? money((grossProfit / revenue) * 100) : 0,
        unitsSold: row?.units ?? 0,
      };
    },
  },

  {
    name: "find_product",
    permission: "product:read",
    description:
      "Look up products by name, SKU or category, with current stock. Use before asking about a specific item.",
    parameters: {
      type: "object",
      properties: {
        query: { ...STRING, description: "Part of a product name, SKU or category." },
        limit: { ...NUMBER, description: "Default 10, max 25." },
      },
      required: ["query"],
    },
    handler: async (args, user) => {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const pattern = new RegExp(String(args.query).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const products = await Product.find({
        $or: [{ name: pattern }, { sku: pattern }, { category: pattern }],
      })
        .limit(limit)
        .lean();

      const canSeeCost = roleHas(user.role, "finance:read");

      return {
        products: products.map((product) => ({
          id: product._id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          currentStock: product.quantity,
          lowStockThreshold: product.lowStockThreshold,
          sellingPrice: product.sellingPrice,
          // Belt and braces. The response filter would strip this from the HTTP
          // response anyway, but the model should not see it either - what it
          // sees, it can be induced to paraphrase.
          ...(canSeeCost && { purchasePrice: product.purchasePrice }),
        })),
      };
    },
  },

  {
    name: "get_low_stock",
    permission: "product:read",
    description: "Products at or below their low-stock threshold.",
    parameters: {
      type: "object",
      properties: { limit: { ...NUMBER, description: "Default 20, max 50." } },
    },
    handler: async (args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);

      const products = await Product.find({
        $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
      })
        .select("name sku quantity lowStockThreshold")
        .sort({ quantity: 1 })
        .limit(limit)
        .lean();

      return {
        count: products.length,
        products: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          currentStock: p.quantity,
          threshold: p.lowStockThreshold,
        })),
      };
    },
  },

  {
    name: "get_dead_stock",
    permission: "analytics:read",
    description: "Products with no sales in the given number of days, and the capital tied up.",
    parameters: {
      type: "object",
      properties: {
        days: { ...NUMBER, description: "Days with no sale to qualify. Default 60." },
        limit: { ...NUMBER, description: "Default 20, max 50." },
      },
    },
    handler: async (args) => {
      const days = Number(args.days) || 60;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const cutoff = daysAgo(days);

      const soldRecently = await StockMovement.distinct("product", {
        type: "SALE",
        createdAt: { $gte: cutoff },
      });

      const products = await Product.find({ _id: { $nin: soldRecently }, quantity: { $gt: 0 } })
        .select("name sku quantity purchasePrice")
        .limit(limit)
        .lean();

      return {
        withoutSalesForDays: days,
        count: products.length,
        products: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          currentStock: p.quantity,
          capitalTiedUp: money(p.quantity * (p.purchasePrice || 0)),
        })),
      };
    },
  },

  {
    name: "get_top_customers",
    permission: "analytics:read",
    description: "Customers ranked by spend over a period.",
    parameters: {
      type: "object",
      properties: { ...RANGE_PROPS, limit: { ...NUMBER, description: "Default 10, max 25." } },
    },
    handler: async (args) => {
      const { start, end } = parseRange(args);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

      const rows = await StockMovement.aggregate([
        { $match: { type: "SALE", createdAt: { $gte: start, $lte: end }, customer: { $ne: null } } },
        {
          $group: {
            _id: "$customer",
            spend: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            orders: { $sum: 1 },
          },
        },
        { $sort: { spend: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: Customer.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: "$customer" },
        { $project: { _id: 0, name: "$customer.name", spend: 1, orders: 1 } },
      ]);

      return { customers: rows.map((r) => ({ ...r, spend: money(r.spend) })) };
    },
  },

  {
    name: "get_supplier_summary",
    permission: "supplier:read",
    description: "Suppliers, their configured lead times, and total purchase value from each.",
    parameters: { type: "object", properties: { ...RANGE_PROPS } },
    handler: async (args) => {
      const { start, end } = parseRange({ days: args.days || 365, from: args.from, to: args.to });

      const [suppliers, spend] = await Promise.all([
        Supplier.find().select("name leadTimeDays").lean(),
        StockMovement.aggregate([
          { $match: { type: "PURCHASE", createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: "$supplier",
              spend: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
              orders: { $sum: 1 },
            },
          },
        ]),
      ]);

      const spendById = new Map(spend.map((row) => [String(row._id), row]));

      return {
        suppliers: suppliers.map((supplier) => ({
          name: supplier.name,
          leadTimeDays: supplier.leadTimeDays,
          purchaseValue: money(spendById.get(String(supplier._id))?.spend),
          orders: spendById.get(String(supplier._id))?.orders ?? 0,
        })),
      };
    },
  },

  {
    name: "forecast_product_demand",
    permission: "analytics:read",
    description:
      "Forecast future demand for one product, with a prediction interval and a reorder recommendation. Call find_product first to get the id.",
    parameters: {
      type: "object",
      properties: {
        productId: { ...STRING, description: "The product's id, from find_product." },
        horizonDays: { ...NUMBER, description: "Days ahead. Default 30, max 90." },
      },
      required: ["productId"],
    },
    handler: async (args) => {
      if (!mongoose.Types.ObjectId.isValid(args.productId)) {
        return { error: "Not a valid product id. Call find_product first." };
      }

      const product = await Product.findById(args.productId).lean();
      if (!product) return { error: "No product with that id." };

      const horizon = Math.min(Math.max(Number(args.horizonDays) || 30, 1), 90);
      const series = await getProductDemandSeries(args.productId);
      const forecast = forecastDemand(series, horizon);
      const stats = demandStatistics(series);
      const leadTime = await getLeadTimeForProduct(args.productId);

      const policy = calculateReorderPolicy({
        meanDailyDemand: stats.meanDailyDemand,
        demandStdDev: stats.demandStdDev,
        leadTimeDays: leadTime.leadTimeDays,
        currentStock: product.quantity,
      });

      return {
        product: { name: product.name, sku: product.sku, currentStock: product.quantity },
        method: forecast.method,
        // Deliberately a summary, not 90 daily points: the model does not need
        // the full series to answer a question, and sending it wastes tokens.
        expectedOverHorizon: forecast.totalExpected,
        horizonDays: horizon,
        averageDailyDemand: forecast.dailyMean,
        warning: forecast.warning,
        reorder: {
          urgency: policy.urgency,
          reorderPoint: policy.reorderPoint,
          safetyStock: policy.safetyStock,
          suggestedQuantity: policy.suggestedQuantity,
          daysOfCover: policy.daysOfCover,
          leadTimeDays: leadTime.leadTimeDays,
        },
      };
    },
  },

  {
    name: "get_reorder_suggestions",
    permission: "analytics:read",
    description:
      "Which products need reordering right now, ranked by urgency, with suggested quantities.",
    parameters: {
      type: "object",
      properties: { limit: { ...NUMBER, description: "Default 15, max 40." } },
    },
    handler: async (args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);

      const products = await Product.find().select("name sku quantity").lean();
      const { getAllDemandSeries } = require("../forecasting/demandRepository");
      const allSeries = await getAllDemandSeries(90);

      const rows = products
        .map((product) => {
          const series = allSeries.get(String(product._id)) ?? { dates: [], values: [] };
          const stats = demandStatistics(series);
          const policy = calculateReorderPolicy({
            meanDailyDemand: stats.meanDailyDemand,
            demandStdDev: stats.demandStdDev,
            leadTimeDays: 7,
            currentStock: product.quantity,
          });

          return {
            name: product.name,
            sku: product.sku,
            currentStock: product.quantity,
            urgency: policy.urgency,
            reorderPoint: policy.reorderPoint,
            suggestedQuantity: policy.suggestedQuantity,
            daysOfCover: policy.daysOfCover,
          };
        })
        .filter((row) => row.suggestedQuantity > 0)
        .sort((a, b) => a.daysOfCover - b.daysOfCover)
        .slice(0, limit);

      return { count: rows.length, products: rows };
    },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** The declarations Gemini sees - names, descriptions and parameter schemas only. */
const toolDeclarationsFor = (role) =>
  TOOLS.filter((tool) => roleHas(role, tool.permission)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

module.exports = { TOOLS, TOOLS_BY_NAME, toolDeclarationsFor, parseRange };
