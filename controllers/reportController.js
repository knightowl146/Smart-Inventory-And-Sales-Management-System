"use strict";

/**
 * reportController.js
 *
 * Six structured reports, each supporting optional date-range filtering
 * and optional format output (json | csv | xlsx | pdf) via ?format=.
 *
 * All business logic uses MongoDB aggregations identical in style to
 * the existing analyticsController.js.  No calculations are duplicated
 * inside the export layer — data flows: aggregation → response object →
 * exportService.
 */

const mongoose = require("mongoose");
const Product        = require("../models/Product");
const StockMovements = require("../models/StockMovements");
const Customer       = require("../models/Customer");
const Supplier       = require("../models/Supplier");
const {
  exportToCSV,
  exportToXLSX,
  exportToPDF,
  setDownloadHeaders
} = require("../services/exportService");


/* ------------------------------------------------------------------ */
/* Shared helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a createdAt match object from optional query params.
 * Returns undefined when neither startDate nor endDate is supplied,
 * so the caller can skip adding the field altogether.
 */
const buildDateMatch = (startDate, endDate) => {
  if (!startDate && !endDate) return undefined;

  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
};

/**
 * Validate a date string.  Returns true when valid or when no string
 * is provided (treating absence as valid).
 */
const isValidDateOrEmpty = (d) => {
  if (!d) return true;
  const parsed = new Date(d);
  return !isNaN(parsed.getTime());
};

/** Allowed export formats */
const ALLOWED_FORMATS = new Set(["json", "csv", "xlsx", "pdf"]);

/**
 * Return a human-readable period description.
 */
const describePeriod = (startDate, endDate) => {
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  if (startDate)            return `From ${startDate}`;
  if (endDate)              return `Up to ${endDate}`;
  return "All time";
};

/**
 * Round a number to 2 decimal places safely.
 */
const round2 = (n) => (typeof n === "number" ? Number(n.toFixed(2)) : 0);

/**
 * Generic function to send either JSON or a file download.
 *
 * @param {import("express").Response} res
 * @param {string}   format     - "json" | "csv" | "xlsx" | "pdf"
 * @param {string}   title      - Human-readable report name
 * @param {string}   filename   - Download base filename (no extension)
 * @param {Object}   meta       - Period / generatedAt metadata
 * @param {Object}   jsonBody   - Full JSON response body
 * @param {Object[]} flatRows   - Flat, serialisable rows for file exports
 * @param {Array}    columns    - Column definitions for xlsx/pdf
 */
const sendReport = async (res, format, title, filename, meta, jsonBody, flatRows, columns) => {
  if (format === "json") {
    return res.status(200).json(jsonBody);
  }

  setDownloadHeaders(res, format, filename);

  if (format === "csv") {
    const fields = columns.map((c) => c.key);
    return res.send(exportToCSV(flatRows, fields));
  }

  if (format === "xlsx") {
    const xlsxColumns = columns.map((c) => ({
      header: c.label,
      key:    c.key,
      width:  c.width || 20
    }));
    const buffer = await exportToXLSX(flatRows, title, xlsxColumns);
    return res.send(buffer);
  }

  if (format === "pdf") {
    const pdfCols = columns.map((c) => ({ label: c.label, key: c.key }));
    const buffer  = await exportToPDF(title, flatRows, pdfCols, meta);
    return res.send(buffer);
  }
};


/* ================================================================== */
/* 1. SALES REPORT                                                      */
/* GET /api/reports/sales?startDate=&endDate=&format=                  */
/* ================================================================== */
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format. Use: json, csv, xlsx, pdf" });
    }
    if (!isValidDateOrEmpty(startDate) || !isValidDateOrEmpty(endDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use ISO 8601 (YYYY-MM-DD)." });
    }

    const dateRange = buildDateMatch(startDate, endDate);
    const matchStage = { type: "SALE", ...(dateRange && { createdAt: dateRange }) };

    /* Summary totals */
    const [totals] = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:             null,
          totalSales:      { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          totalUnitsSold:  { $sum: "$quantity" },
          salesCount:      { $sum: 1 }
        }
      }
    ]);

    const summary = totals
      ? {
          totalSales:     round2(totals.totalSales),
          totalUnitsSold: totals.totalUnitsSold,
          salesCount:     totals.salesCount,
          averageOrderValue: totals.salesCount > 0
            ? round2(totals.totalSales / totals.salesCount)
            : 0
        }
      : { totalSales: 0, totalUnitsSold: 0, salesCount: 0, averageOrderValue: 0 };

    /* Top selling products */
    const topProducts = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:          "$product",
          quantitySold: { $sum: "$quantity" },
          revenue:      { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          salesCount:   { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "products", localField: "_id",
          foreignField: "_id", as: "product"
        }
      },
      { $unwind: "$product" },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          productId:    "$product._id",
          name:         "$product.name",
          category:     "$product.category",
          quantitySold: 1,
          revenue:      { $round: ["$revenue", 2] },
          salesCount:   1
        }
      }
    ]);

    /* Sales by category */
    const byCategory = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products", localField: "product",
          foreignField: "_id", as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id:          "$product.category",
          quantitySold: { $sum: "$quantity" },
          revenue:      { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          salesCount:   { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      {
        $project: {
          _id: 0,
          category:     "$_id",
          quantitySold: 1,
          revenue:      { $round: ["$revenue", 2] },
          salesCount:   1
        }
      }
    ]);

    /* Sales over time */
    const overTime = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:         { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          unitsSold:   { $sum: "$quantity" },
          revenue:     { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          salesCount:  { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0, date: "$_id",
          unitsSold: 1, revenue: 1, salesCount: 1
        }
      }
    ]);

    const meta = {
      generatedAt: new Date().toISOString(),
      period:      describePeriod(startDate, endDate),
      startDate:   startDate || null,
      endDate:     endDate || null
    };

    const jsonBody = {
      success: true,
      meta,
      summary,
      topProducts,
      byCategory,
      overTime
    };

    /* Flat rows for file exports (top products used as primary table) */
    const flatRows = topProducts.map((p) => ({
      name:         p.name,
      category:     p.category,
      quantitySold: p.quantitySold,
      revenue:      p.revenue,
      salesCount:   p.salesCount
    }));

    const columns = [
      { label: "Product Name",   key: "name",         width: 30 },
      { label: "Category",       key: "category",     width: 20 },
      { label: "Units Sold",     key: "quantitySold", width: 15 },
      { label: "Revenue ($)",    key: "revenue",      width: 15 },
      { label: "# Transactions", key: "salesCount",   width: 18 }
    ];

    return sendReport(res, format, "Sales Report", "sales_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("Sales Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate sales report" });
  }
};


/* ================================================================== */
/* 2. PURCHASE REPORT                                                   */
/* GET /api/reports/purchases?startDate=&endDate=&format=              */
/* ================================================================== */
const getPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }
    if (!isValidDateOrEmpty(startDate) || !isValidDateOrEmpty(endDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format." });
    }

    const dateRange  = buildDateMatch(startDate, endDate);
    const matchStage = { type: "PURCHASE", ...(dateRange && { createdAt: dateRange }) };

    /* Summary */
    const [totals] = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:                  null,
          totalPurchaseCost:    { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          totalUnitsPurchased:  { $sum: "$quantity" },
          purchaseCount:        { $sum: 1 }
        }
      }
    ]);

    const summary = totals
      ? {
          totalPurchaseCost:   round2(totals.totalPurchaseCost),
          totalUnitsPurchased: totals.totalUnitsPurchased,
          purchaseCount:       totals.purchaseCount
        }
      : { totalPurchaseCost: 0, totalUnitsPurchased: 0, purchaseCount: 0 };

    /* By product */
    const byProduct = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:              "$product",
          totalPurchased:   { $sum: "$quantity" },
          totalCost:        { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          purchaseCount:    { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "products", localField: "_id",
          foreignField: "_id", as: "product"
        }
      },
      { $unwind: "$product" },
      { $sort: { totalCost: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          productId:      "$product._id",
          name:           "$product.name",
          category:       "$product.category",
          totalPurchased: 1,
          totalCost:      { $round: ["$totalCost", 2] },
          purchaseCount:  1
        }
      }
    ]);

    /* By supplier */
    const bySupplier = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:           "$supplier",
          totalUnits:    { $sum: "$quantity" },
          totalCost:     { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "suppliers", localField: "_id",
          foreignField: "_id", as: "supplier"
        }
      },
      { $unwind: { path: "$supplier", preserveNullAndEmpty: true } },
      { $sort: { totalCost: -1 } },
      {
        $project: {
          _id: 0,
          supplierId:    "$_id",
          supplierName:  { $ifNull: ["$supplier.name", "Unknown"] },
          totalUnits:    1,
          totalCost:     { $round: ["$totalCost", 2] },
          purchaseCount: 1
        }
      }
    ]);

    /* Over time */
    const overTime = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:             { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          unitsPurchased:  { $sum: "$quantity" },
          totalCost:       { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          purchaseCount:   { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0, date: "$_id",
          unitsPurchased: 1, totalCost: 1, purchaseCount: 1
        }
      }
    ]);

    const meta = {
      generatedAt: new Date().toISOString(),
      period:      describePeriod(startDate, endDate),
      startDate:   startDate || null,
      endDate:     endDate   || null
    };

    const jsonBody = { success: true, meta, summary, byProduct, bySupplier, overTime };

    const flatRows = byProduct.map((p) => ({
      name:           p.name,
      category:       p.category,
      totalPurchased: p.totalPurchased,
      totalCost:      p.totalCost,
      purchaseCount:  p.purchaseCount
    }));

    const columns = [
      { label: "Product Name",       key: "name",           width: 30 },
      { label: "Category",           key: "category",       width: 20 },
      { label: "Units Purchased",    key: "totalPurchased", width: 18 },
      { label: "Total Cost ($)",     key: "totalCost",      width: 15 },
      { label: "# Transactions",     key: "purchaseCount",  width: 18 }
    ];

    return sendReport(res, format, "Purchase Report", "purchase_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("Purchase Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate purchase report" });
  }
};


/* ================================================================== */
/* 3. INVENTORY REPORT                                                  */
/* GET /api/reports/inventory?format=                                   */
/* ================================================================== */
const getInventoryReport = async (req, res) => {
  try {
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }

    /* Summary / health */
    const [health] = await Product.aggregate([
      {
        $group: {
          _id:                  null,
          totalProducts:        { $sum: 1 },
          totalQuantity:        { $sum: "$quantity" },
          inventoryValue:       { $sum: { $multiply: ["$quantity", "$purchasePrice"] } },
          lowStockProducts:     {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", "$lowStockThreshold"] }] },
                1, 0
              ]
            }
          },
          outOfStockProducts:   { $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] } }
        }
      }
    ]);

    const summary = health
      ? {
          totalProducts:      health.totalProducts,
          totalQuantity:      health.totalQuantity,
          inventoryValue:     round2(health.inventoryValue),
          lowStockProducts:   health.lowStockProducts,
          outOfStockProducts: health.outOfStockProducts,
          healthyProducts:    health.totalProducts - health.lowStockProducts - health.outOfStockProducts
        }
      : { totalProducts: 0, totalQuantity: 0, inventoryValue: 0, lowStockProducts: 0, outOfStockProducts: 0, healthyProducts: 0 };

    /* All products with stock status */
    const products = await Product.aggregate([
      {
        $project: {
          _id: 0,
          productId:          "$_id",
          name:               1,
          sku:                1,
          category:           1,
          quantity:           1,
          lowStockThreshold:  1,
          purchasePrice:      1,
          sellingPrice:       1,
          inventoryValue:     { $round: [{ $multiply: ["$quantity", "$purchasePrice"] }, 2] },
          status: {
            $cond: [
              { $eq: ["$quantity", 0] },
              "OUT_OF_STOCK",
              {
                $cond: [
                  { $lte: ["$quantity", "$lowStockThreshold"] },
                  "LOW_STOCK",
                  "HEALTHY"
                ]
              }
            ]
          }
        }
      },
      { $sort: { quantity: 1 } }
    ]);

    /* By category */
    const byCategory = await Product.aggregate([
      {
        $group: {
          _id:            "$category",
          productCount:   { $sum: 1 },
          totalQuantity:  { $sum: "$quantity" },
          inventoryValue: { $sum: { $multiply: ["$quantity", "$purchasePrice"] } }
        }
      },
      { $sort: { inventoryValue: -1 } },
      {
        $project: {
          _id: 0,
          category:       "$_id",
          productCount:   1,
          totalQuantity:  1,
          inventoryValue: { $round: ["$inventoryValue", 2] }
        }
      }
    ]);

    const meta = {
      generatedAt: new Date().toISOString(),
      period:      "Current snapshot",
      startDate:   null,
      endDate:     null
    };

    const jsonBody = { success: true, meta, summary, products, byCategory };

    const flatRows = products.map((p) => ({
      name:              p.name,
      sku:               p.sku,
      category:          p.category,
      quantity:          p.quantity,
      lowStockThreshold: p.lowStockThreshold,
      purchasePrice:     p.purchasePrice,
      inventoryValue:    p.inventoryValue,
      status:            p.status
    }));

    const columns = [
      { label: "Name",              key: "name",              width: 30 },
      { label: "SKU",               key: "sku",               width: 15 },
      { label: "Category",          key: "category",          width: 20 },
      { label: "Quantity",          key: "quantity",          width: 12 },
      { label: "Low Stock Thresh.", key: "lowStockThreshold", width: 18 },
      { label: "Purchase Price",    key: "purchasePrice",     width: 16 },
      { label: "Inventory Value",   key: "inventoryValue",    width: 16 },
      { label: "Status",            key: "status",            width: 15 }
    ];

    return sendReport(res, format, "Inventory Report", "inventory_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("Inventory Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate inventory report" });
  }
};


/* ================================================================== */
/* 4. PROFIT & LOSS REPORT                                              */
/* GET /api/reports/profit-loss?startDate=&endDate=&format=            */
/* ================================================================== */
const getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }
    if (!isValidDateOrEmpty(startDate) || !isValidDateOrEmpty(endDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format." });
    }

    const dateRange  = buildDateMatch(startDate, endDate);
    const matchStage = dateRange ? { createdAt: dateRange } : {};

    /* Current period totals */
    const currentPeriodAgg = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:    "$type",
          amount: { $sum: { $multiply: ["$quantity", "$unitPrice"] } }
        }
      }
    ]);

    let revenue = 0;
    let purchaseCost = 0;
    currentPeriodAgg.forEach((item) => {
      if (item._id === "SALE")     revenue      = item.amount;
      if (item._id === "PURCHASE") purchaseCost = item.amount;
    });

    const grossProfit   = revenue - purchaseCost;
    const profitMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    /* Previous period comparison (only when both dates supplied) */
    let previousPeriod = null;
    if (startDate && endDate) {
      const start       = new Date(startDate);
      const end         = new Date(endDate);
      const periodMs    = end.getTime() - start.getTime();
      const prevEnd     = new Date(start.getTime() - 1);
      const prevStart   = new Date(prevEnd.getTime() - periodMs);

      const prevAgg = await StockMovements.aggregate([
        { $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
        {
          $group: {
            _id:    "$type",
            amount: { $sum: { $multiply: ["$quantity", "$unitPrice"] } }
          }
        }
      ]);

      let prevRevenue = 0;
      let prevCost    = 0;
      prevAgg.forEach((item) => {
        if (item._id === "SALE")     prevRevenue = item.amount;
        if (item._id === "PURCHASE") prevCost    = item.amount;
      });

      const prevProfit = prevRevenue - prevCost;
      const revenueGrowth = prevRevenue === 0
        ? (prevRevenue > 0 ? 100 : 0)
        : ((revenue - prevRevenue) / prevRevenue) * 100;

      previousPeriod = {
        revenue:      round2(prevRevenue),
        purchaseCost: round2(prevCost),
        grossProfit:  round2(prevProfit),
        revenueGrowth: round2(revenueGrowth)
      };
    }

    /* By product */
    const byProduct = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:    { product: "$product", type: "$type" },
          amount: { $sum: { $multiply: ["$quantity", "$unitPrice"] } }
        }
      },
      {
        $group: {
          _id:          "$_id.product",
          revenue:      {
            $sum: { $cond: [{ $eq: ["$_id.type", "SALE"] }, "$amount", 0] }
          },
          purchaseCost: {
            $sum: { $cond: [{ $eq: ["$_id.type", "PURCHASE"] }, "$amount", 0] }
          }
        }
      },
      {
        $lookup: {
          from: "products", localField: "_id",
          foreignField: "_id", as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          name:         "$product.name",
          category:     "$product.category",
          revenue:      { $round: ["$revenue", 2] },
          purchaseCost: { $round: ["$purchaseCost", 2] },
          grossProfit: {
            $round: [{ $subtract: ["$revenue", "$purchaseCost"] }, 2]
          },
          profitMargin: {
            $round: [
              {
                $cond: [
                  { $gt: ["$revenue", 0] },
                  { $multiply: [{ $divide: [{ $subtract: ["$revenue", "$purchaseCost"] }, "$revenue"] }, 100] },
                  0
                ]
              },
              2
            ]
          }
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);

    const meta = {
      generatedAt: new Date().toISOString(),
      period:      describePeriod(startDate, endDate),
      startDate:   startDate || null,
      endDate:     endDate   || null
    };

    const jsonBody = {
      success: true,
      meta,
      summary: {
        revenue:       round2(revenue),
        purchaseCost:  round2(purchaseCost),
        grossProfit:   round2(grossProfit),
        profitMargin:  round2(profitMargin),
        previousPeriod
      },
      byProduct
    };

    const flatRows = byProduct.map((p) => ({
      name:         p.name,
      category:     p.category,
      revenue:      p.revenue,
      purchaseCost: p.purchaseCost,
      grossProfit:  p.grossProfit,
      profitMargin: p.profitMargin
    }));

    const columns = [
      { label: "Product Name",   key: "name",         width: 30 },
      { label: "Category",       key: "category",     width: 20 },
      { label: "Revenue ($)",    key: "revenue",      width: 15 },
      { label: "Cost ($)",       key: "purchaseCost", width: 15 },
      { label: "Gross Profit",   key: "grossProfit",  width: 15 },
      { label: "Margin (%)",     key: "profitMargin", width: 12 }
    ];

    return sendReport(res, format, "Profit & Loss Report", "profit_loss_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("P&L Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate profit & loss report" });
  }
};


/* ================================================================== */
/* 5. SUPPLIER REPORT                                                   */
/* GET /api/reports/suppliers?startDate=&endDate=&format=              */
/* ================================================================== */
const getSupplierReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }
    if (!isValidDateOrEmpty(startDate) || !isValidDateOrEmpty(endDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format." });
    }

    const dateRange  = buildDateMatch(startDate, endDate);
    const matchStage = { type: "PURCHASE", ...(dateRange && { createdAt: dateRange }) };

    /* Per-supplier breakdown */
    const suppliers = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:               "$supplier",
          totalUnitsPurchased: { $sum: "$quantity" },
          totalPurchaseValue:  { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          purchaseCount:       { $sum: 1 },
          productIds:          { $addToSet: "$product" }
        }
      },
      {
        $lookup: {
          from: "suppliers", localField: "_id",
          foreignField: "_id", as: "supplier"
        }
      },
      { $unwind: { path: "$supplier", preserveNullAndEmpty: true } },
      { $sort: { totalPurchaseValue: -1 } },
      {
        $project: {
          _id: 0,
          supplierId:          "$_id",
          supplierName:        { $ifNull: ["$supplier.name",  "Unknown"] },
          supplierEmail:       { $ifNull: ["$supplier.email", ""] },
          supplierPhone:       { $ifNull: ["$supplier.phone", ""] },
          totalUnitsPurchased: 1,
          totalPurchaseValue:  { $round: ["$totalPurchaseValue", 2] },
          purchaseCount:       1,
          uniqueProducts:      { $size: "$productIds" }
        }
      }
    ]);

    /* Overall totals */
    const totalSuppliers = await Supplier.countDocuments();
    const totalValue     = suppliers.reduce((s, r) => s + r.totalPurchaseValue, 0);

    const meta = {
      generatedAt:     new Date().toISOString(),
      period:          describePeriod(startDate, endDate),
      totalSuppliers,
      startDate:       startDate || null,
      endDate:         endDate   || null
    };

    const jsonBody = {
      success: true,
      meta,
      summary: {
        totalSuppliers,
        totalPurchaseValue: round2(totalValue),
        activeSuppliers:    suppliers.length
      },
      suppliers
    };

    const flatRows = suppliers.map((s) => ({
      supplierName:        s.supplierName,
      supplierEmail:       s.supplierEmail,
      supplierPhone:       s.supplierPhone,
      totalUnitsPurchased: s.totalUnitsPurchased,
      totalPurchaseValue:  s.totalPurchaseValue,
      purchaseCount:       s.purchaseCount,
      uniqueProducts:      s.uniqueProducts
    }));

    const columns = [
      { label: "Supplier Name",        key: "supplierName",        width: 25 },
      { label: "Email",                key: "supplierEmail",       width: 25 },
      { label: "Phone",                key: "supplierPhone",       width: 15 },
      { label: "Units Purchased",      key: "totalUnitsPurchased", width: 18 },
      { label: "Purchase Value ($)",   key: "totalPurchaseValue",  width: 18 },
      { label: "# Transactions",       key: "purchaseCount",       width: 16 },
      { label: "Unique Products",      key: "uniqueProducts",      width: 16 }
    ];

    return sendReport(res, format, "Supplier Report", "supplier_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("Supplier Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate supplier report" });
  }
};


/* ================================================================== */
/* 6. CUSTOMER REPORT                                                   */
/* GET /api/reports/customers?startDate=&endDate=&format=              */
/* ================================================================== */
const getCustomerReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const format = (req.query.format || "json").toLowerCase();

    if (!ALLOWED_FORMATS.has(format)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }
    if (!isValidDateOrEmpty(startDate) || !isValidDateOrEmpty(endDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format." });
    }

    const dateRange  = buildDateMatch(startDate, endDate);
    const matchStage = { type: "SALE", ...(dateRange && { createdAt: dateRange }) };

    /* Per-customer breakdown */
    const customers = await StockMovements.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:            "$customer",
          totalSpent:     { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          totalUnits:     { $sum: "$quantity" },
          purchaseCount:  { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "customers", localField: "_id",
          foreignField: "_id", as: "customer"
        }
      },
      { $unwind: { path: "$customer", preserveNullAndEmpty: true } },
      { $sort: { totalSpent: -1 } },
      {
        $project: {
          _id: 0,
          customerId:    "$_id",
          customerName:  { $ifNull: ["$customer.name",  "Unknown"] },
          customerEmail: { $ifNull: ["$customer.email", ""] },
          customerPhone: { $ifNull: ["$customer.phone", ""] },
          totalSpent:    { $round: ["$totalSpent", 2] },
          totalUnits:    1,
          purchaseCount: 1,
          averageOrderValue: {
            $round: [
              { $cond: [{ $gt: ["$purchaseCount", 0] }, { $divide: ["$totalSpent", "$purchaseCount"] }, 0] },
              2
            ]
          }
        }
      }
    ]);

    /* Overall totals */
    const totalCustomers  = await Customer.countDocuments();
    const totalRevenue    = customers.reduce((s, c) => s + c.totalSpent, 0);

    const meta = {
      generatedAt:    new Date().toISOString(),
      period:         describePeriod(startDate, endDate),
      totalCustomers,
      startDate:      startDate || null,
      endDate:        endDate   || null
    };

    const jsonBody = {
      success: true,
      meta,
      summary: {
        totalCustomers,
        activeCustomers:   customers.length,
        totalRevenue:      round2(totalRevenue)
      },
      customers
    };

    const flatRows = customers.map((c) => ({
      customerName:     c.customerName,
      customerEmail:    c.customerEmail,
      customerPhone:    c.customerPhone,
      totalSpent:       c.totalSpent,
      totalUnits:       c.totalUnits,
      purchaseCount:    c.purchaseCount,
      averageOrderValue: c.averageOrderValue
    }));

    const columns = [
      { label: "Customer Name",    key: "customerName",     width: 25 },
      { label: "Email",            key: "customerEmail",    width: 25 },
      { label: "Phone",            key: "customerPhone",    width: 15 },
      { label: "Total Spent ($)",  key: "totalSpent",       width: 16 },
      { label: "Units Bought",     key: "totalUnits",       width: 14 },
      { label: "# Purchases",      key: "purchaseCount",    width: 14 },
      { label: "Avg Order ($)",    key: "averageOrderValue",width: 14 }
    ];

    return sendReport(res, format, "Customer Report", "customer_report", meta, jsonBody, flatRows, columns);

  } catch (error) {
    console.error("Customer Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate customer report" });
  }
};


module.exports = {
  getSalesReport,
  getPurchaseReport,
  getInventoryReport,
  getProfitLossReport,
  getSupplierReport,
  getCustomerReport
};
