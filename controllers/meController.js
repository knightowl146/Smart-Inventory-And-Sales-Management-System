const mongoose = require("mongoose");
const StockMovement = require("../models/StockMovements");
const Product = require("../models/Product");

/**
 * The employee dashboard.
 *
 * Deliberately a purpose-built endpoint rather than a filtered view of
 * /api/analytics. Trying to strip revenue, cost and margin out of the rich
 * analytics responses would mean auditing dozens of aggregation shapes and
 * getting every one of them right forever; building the narrow view an employee
 * actually needs is both safer and less code. The whole /api/analytics tree
 * stays owner-only.
 */
const getMySummary = async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const baseFilter = { createdBy: userId, type: "SALE" };

    const [todayTotals, weekTotals, recentSales, lowStockCount] = await Promise.all([
      StockMovement.aggregate([
        { $match: { ...baseFilter, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, units: { $sum: "$quantity" }, transactions: { $sum: 1 } } },
      ]),

      StockMovement.aggregate([
        { $match: { ...baseFilter, createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, units: { $sum: "$quantity" }, transactions: { $sum: 1 } } },
      ]),

      StockMovement.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("product", "name sku")
        .populate("customer", "name"),

      Product.countDocuments({
        $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user: { name: req.user.name, role: req.user.role },
        today: {
          unitsSold: todayTotals[0]?.units || 0,
          transactions: todayTotals[0]?.transactions || 0,
        },
        last7Days: {
          unitsSold: weekTotals[0]?.units || 0,
          transactions: weekTotals[0]?.transactions || 0,
        },
        lowStockCount,
        recentSales: recentSales.map((movement) => ({
          id: movement._id,
          product: movement.product?.name || "Unknown product",
          sku: movement.product?.sku || null,
          customer: movement.customer?.name || null,
          quantity: movement.quantity,
          createdAt: movement.createdAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getMySummary };
