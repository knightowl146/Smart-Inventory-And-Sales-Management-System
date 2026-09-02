const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const {
  exportToCSV,
  exportToXLSX,
  exportToPDF,
  setDownloadHeaders
} = require("../services/exportService");

/**
 * Helper function to build date filter consistently across all reports
 */
function buildDateFilter(startDate, endDate) {
  const filter = {};
  
  if (startDate || endDate) {
    filter.createdAt = {};
    
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw new Error("Invalid startDate");
      }
      filter.createdAt.$gte = start;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw new Error("Invalid endDate");
      }
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  
  return filter;
}

//<-----------------SALES REPORT----------------->
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "SALE",
      ...dateFilter
    };
    
    // Total sales aggregation
    const salesSummary = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalUnitsSold: { $sum: "$quantity" },
          totalRevenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          }
        }
      }
    ]);
    
    const summary = salesSummary[0] || {
      totalTransactions: 0,
      totalUnitsSold: 0,
      totalRevenue: 0
    };
    
    // Sales by product
    const salesByProduct = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$product",
          unitsSold: { $sum: "$quantity" },
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          salesCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          productId: "$product._id",
          productName: "$product.name",
          category: "$product.category",
          unitsSold: 1,
          revenue: { $round: ["$revenue", 2] },
          salesCount: 1
        }
      },
      { $sort: { revenue: -1 } }
    ]);
    
    // Sales by category
    const salesByCategory = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          unitsSold: { $sum: "$quantity" },
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          salesCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          unitsSold: 1,
          revenue: { $round: ["$revenue", 2] },
          salesCount: 1
        }
      },
      { $sort: { revenue: -1 } }
    ]);
    
    // Sales over time
    const salesOverTime = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          unitsSold: { $sum: "$quantity" },
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          salesCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          unitsSold: 1,
          revenue: { $round: ["$revenue", 2] },
          salesCount: 1
        }
      }
    ]);
    
    // Top customers
    const topCustomers = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$customer",
          totalSpent: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          unitsPurchased: { $sum: "$quantity" },
          salesCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },
      {
        $project: {
          _id: 0,
          customerId: "$customer._id",
          customerName: "$customer.name",
          totalSpent: { $round: ["$totalSpent", 2] },
          unitsPurchased: 1,
          salesCount: 1
        }
      }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          totalTransactions: summary.totalTransactions,
          totalUnitsSold: summary.totalUnitsSold,
          totalRevenue: Number(summary.totalRevenue.toFixed(2))
        },
        salesByProduct,
        salesByCategory,
        salesOverTime,
        topCustomers
      }
    });
  } catch (error) {
    console.error("Get Sales Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate sales report"
    });
  }
};

//<-----------------PURCHASE REPORT----------------->
const getPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "PURCHASE",
      ...dateFilter
    };
    
    // Total purchases aggregation
    const purchaseSummary = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalUnitsPurchased: { $sum: "$quantity" },
          totalPurchaseCost: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          }
        }
      }
    ]);
    
    const summary = purchaseSummary[0] || {
      totalTransactions: 0,
      totalUnitsPurchased: 0,
      totalPurchaseCost: 0
    };
    
    // Purchases by product
    const purchasesByProduct = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$product",
          unitsPurchased: { $sum: "$quantity" },
          purchaseCost: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          productId: "$product._id",
          productName: "$product.name",
          category: "$product.category",
          unitsPurchased: 1,
          purchaseCost: { $round: ["$purchaseCost", 2] },
          purchaseCount: 1
        }
      },
      { $sort: { purchaseCost: -1 } }
    ]);
    
    // Purchases by category
    const purchasesByCategory = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          unitsPurchased: { $sum: "$quantity" },
          purchaseCost: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          unitsPurchased: 1,
          purchaseCost: { $round: ["$purchaseCost", 2] },
          purchaseCount: 1
        }
      },
      { $sort: { purchaseCost: -1 } }
    ]);
    
    // Purchases over time
    const purchasesOverTime = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          unitsPurchased: { $sum: "$quantity" },
          purchaseCost: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          unitsPurchased: 1,
          purchaseCost: { $round: ["$purchaseCost", 2] },
          purchaseCount: 1
        }
      }
    ]);
    
    // Top suppliers
    const topSuppliers = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$supplier",
          totalPurchaseCost: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          unitsPurchased: { $sum: "$quantity" },
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { totalPurchaseCost: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },
      {
        $project: {
          _id: 0,
          supplierId: "$supplier._id",
          supplierName: "$supplier.name",
          totalPurchaseCost: { $round: ["$totalPurchaseCost", 2] },
          unitsPurchased: 1,
          purchaseCount: 1
        }
      }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          totalTransactions: summary.totalTransactions,
          totalUnitsPurchased: summary.totalUnitsPurchased,
          totalPurchaseCost: Number(summary.totalPurchaseCost.toFixed(2))
        },
        purchasesByProduct,
        purchasesByCategory,
        purchasesOverTime,
        topSuppliers
      }
    });
  } catch (error) {
    console.error("Get Purchase Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate purchase report"
    });
  }
};

//<-----------------INVENTORY REPORT----------------->
const getInventoryReport = async (req, res) => {
  try {
    // Current inventory summary
    const inventorySummary = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalInventoryValue: {
            $sum: { $multiply: ["$quantity", "$purchasePrice"] }
          },
          lowStockCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$quantity", 0] },
                    { $lte: ["$quantity", "$lowStockThreshold"] }
                  ]
                },
                1,
                0
              ]
            }
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ["$quantity", 0] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    const summary = inventorySummary[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      totalInventoryValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };
    
    // Inventory by category
    const inventoryByCategory = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          productCount: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          inventoryValue: {
            $sum: { $multiply: ["$quantity", "$purchasePrice"] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          productCount: 1,
          totalQuantity: 1,
          inventoryValue: { $round: ["$inventoryValue", 2] }
        }
      },
      { $sort: { inventoryValue: -1 } }
    ]);
    
    // Low stock products
    const lowStockProducts = await Product.find({
      $expr: {
        $and: [
          { $gt: ["$quantity", 0] },
          { $lte: ["$quantity", "$lowStockThreshold"] }
        ]
      }
    })
      .select("name sku category quantity lowStockThreshold purchasePrice")
      .sort({ quantity: 1 })
      .lean();
    
    const lowStockProductsFormatted = lowStockProducts.map(product => ({
      productId: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      currentStock: product.quantity,
      lowStockThreshold: product.lowStockThreshold,
      inventoryValue: Number((product.quantity * product.purchasePrice).toFixed(2))
    }));
    
    // Out of stock products
    const outOfStockProducts = await Product.find({ quantity: 0 })
      .select("name sku category lowStockThreshold")
      .sort({ name: 1 })
      .lean();
    
    const outOfStockProductsFormatted = outOfStockProducts.map(product => ({
      productId: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      lowStockThreshold: product.lowStockThreshold
    }));
    
    // Stock movement summary
    const movementSummary = await StockMovement.aggregate([
      {
        $group: {
          _id: "$type",
          totalQuantity: { $sum: "$quantity" },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    let totalPurchased = 0;
    let totalSold = 0;
    let purchaseTransactions = 0;
    let saleTransactions = 0;
    
    movementSummary.forEach(item => {
      if (item._id === "PURCHASE") {
        totalPurchased = item.totalQuantity;
        purchaseTransactions = item.transactionCount;
      } else if (item._id === "SALE") {
        totalSold = item.totalQuantity;
        saleTransactions = item.transactionCount;
      }
    });
    
    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalProducts: summary.totalProducts,
          totalQuantity: summary.totalQuantity,
          totalInventoryValue: Number(summary.totalInventoryValue.toFixed(2)),
          healthyStockCount: summary.totalProducts - summary.lowStockCount - summary.outOfStockCount,
          lowStockCount: summary.lowStockCount,
          outOfStockCount: summary.outOfStockCount
        },
        inventoryByCategory,
        lowStockProducts: lowStockProductsFormatted,
        outOfStockProducts: outOfStockProductsFormatted,
        stockMovementSummary: {
          totalPurchased,
          totalSold,
          purchaseTransactions,
          saleTransactions
        }
      }
    });
  } catch (error) {
    console.error("Get Inventory Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate inventory report"
    });
  }
};

//<-----------------PROFIT & LOSS REPORT----------------->
const getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "SALE",
      ...dateFilter
    };
    
    // Calculate revenue and cost of goods sold
    const financial = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          costOfGoodsSold: {
            $sum: { $multiply: ["$quantity", "$product.purchasePrice"] }
          },
          totalUnitsSold: { $sum: "$quantity" },
          salesCount: { $sum: 1 }
        }
      }
    ]);
    
    const data = financial[0] || {
      revenue: 0,
      costOfGoodsSold: 0,
      totalUnitsSold: 0,
      salesCount: 0
    };
    
    const grossProfit = data.revenue - data.costOfGoodsSold;
    const grossMargin = data.revenue > 0 ? (grossProfit / data.revenue) * 100 : 0;
    
    // Profit by category
    const profitByCategory = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          costOfGoodsSold: {
            $sum: { $multiply: ["$quantity", "$product.purchasePrice"] }
          },
          unitsSold: { $sum: "$quantity" }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          revenue: { $round: ["$revenue", 2] },
          costOfGoodsSold: { $round: ["$costOfGoodsSold", 2] },
          grossProfit: {
            $round: [{ $subtract: ["$revenue", "$costOfGoodsSold"] }, 2]
          },
          grossMargin: {
            $round: [
              {
                $cond: [
                  { $gt: ["$revenue", 0] },
                  {
                    $multiply: [
                      { $divide: [
                        { $subtract: ["$revenue", "$costOfGoodsSold"] },
                        "$revenue"
                      ]},
                      100
                    ]
                  },
                  0
                ]
              },
              2
            ]
          },
          unitsSold: 1
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);
    
    // Profit over time
    const profitOverTime = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          costOfGoodsSold: {
            $sum: { $multiply: ["$quantity", "$product.purchasePrice"] }
          }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          revenue: { $round: ["$revenue", 2] },
          costOfGoodsSold: { $round: ["$costOfGoodsSold", 2] },
          grossProfit: {
            $round: [{ $subtract: ["$revenue", "$costOfGoodsSold"] }, 2]
          }
        }
      }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          revenue: Number(data.revenue.toFixed(2)),
          costOfGoodsSold: Number(data.costOfGoodsSold.toFixed(2)),
          grossProfit: Number(grossProfit.toFixed(2)),
          grossMargin: Number(grossMargin.toFixed(2)),
          totalUnitsSold: data.totalUnitsSold,
          salesCount: data.salesCount
        },
        profitByCategory,
        profitOverTime
      }
    });
  } catch (error) {
    console.error("Get Profit & Loss Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate profit & loss report"
    });
  }
};

//<-----------------SUPPLIER REPORT----------------->
const getSupplierReport = async (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query;
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "PURCHASE",
      ...dateFilter
    };
    
    // Filter by supplier if provided
    if (supplierId) {
      if (!mongoose.Types.ObjectId.isValid(supplierId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid supplier ID"
        });
      }
      matchStage.supplier = new mongoose.Types.ObjectId(supplierId);
    }
    
    // Supplier performance
    const supplierPerformance = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$supplier",
          totalPurchases: { $sum: 1 },
          totalQuantityPurchased: { $sum: "$quantity" },
          totalPurchaseValue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          lastPurchaseDate: { $max: "$createdAt" },
          firstPurchaseDate: { $min: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },
      {
        $project: {
          _id: 0,
          supplierId: "$supplier._id",
          supplierName: "$supplier.name",
          supplierEmail: "$supplier.email",
          supplierPhone: "$supplier.phone",
          totalPurchases: 1,
          totalQuantityPurchased: 1,
          totalPurchaseValue: { $round: ["$totalPurchaseValue", 2] },
          averagePurchaseValue: {
            $round: [
              { $divide: ["$totalPurchaseValue", "$totalPurchases"] },
              2
            ]
          },
          lastPurchaseDate: 1,
          firstPurchaseDate: 1
        }
      },
      { $sort: { totalPurchaseValue: -1 } }
    ]);
    
    // Products by supplier
    const productsBySupplier = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            supplier: "$supplier",
            product: "$product"
          },
          quantityPurchased: { $sum: "$quantity" },
          purchaseValue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id.supplier",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },
      {
        $lookup: {
          from: "products",
          localField: "_id.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          supplierId: "$supplier._id",
          supplierName: "$supplier.name",
          productId: "$product._id",
          productName: "$product.name",
          category: "$product.category",
          quantityPurchased: 1,
          purchaseValue: { $round: ["$purchaseValue", 2] },
          purchaseCount: 1
        }
      },
      { $sort: { supplierName: 1, purchaseValue: -1 } }
    ]);
    
    // Summary
    const totalPurchaseValue = supplierPerformance.reduce(
      (sum, supplier) => sum + supplier.totalPurchaseValue,
      0
    );
    
    const totalQuantityPurchased = supplierPerformance.reduce(
      (sum, supplier) => sum + supplier.totalQuantityPurchased,
      0
    );
    
    const totalTransactions = supplierPerformance.reduce(
      (sum, supplier) => sum + supplier.totalPurchases,
      0
    );
    
    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          totalSuppliers: supplierPerformance.length,
          totalTransactions,
          totalQuantityPurchased,
          totalPurchaseValue: Number(totalPurchaseValue.toFixed(2))
        },
        supplierPerformance,
        productsBySupplier
      }
    });
  } catch (error) {
    console.error("Get Supplier Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate supplier report"
    });
  }
};

//<-----------------CUSTOMER REPORT----------------->
const getCustomerReport = async (req, res) => {
  try {
    const { startDate, endDate, customerId } = req.query;
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "SALE",
      ...dateFilter
    };
    
    // Filter by customer if provided
    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid customer ID"
        });
      }
      matchStage.customer = new mongoose.Types.ObjectId(customerId);
    }
    
    // Customer performance
    const customerPerformance = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$customer",
          totalPurchases: { $sum: 1 },
          totalQuantityPurchased: { $sum: "$quantity" },
          totalSpent: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          lastPurchaseDate: { $max: "$createdAt" },
          firstPurchaseDate: { $min: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },
      {
        $project: {
          _id: 0,
          customerId: "$customer._id",
          customerName: "$customer.name",
          customerEmail: "$customer.email",
          customerPhone: "$customer.phone",
          totalPurchases: 1,
          totalQuantityPurchased: 1,
          totalSpent: { $round: ["$totalSpent", 2] },
          averagePurchaseValue: {
            $round: [
              { $divide: ["$totalSpent", "$totalPurchases"] },
              2
            ]
          },
          lastPurchaseDate: 1,
          firstPurchaseDate: 1
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);
    
    // Products by customer
    const productsByCustomer = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            customer: "$customer",
            product: "$product"
          },
          quantityPurchased: { $sum: "$quantity" },
          totalSpent: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id.customer",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "products",
          localField: "_id.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          customerId: "$customer._id",
          customerName: "$customer.name",
          productId: "$product._id",
          productName: "$product.name",
          category: "$product.category",
          quantityPurchased: 1,
          totalSpent: { $round: ["$totalSpent", 2] },
          purchaseCount: 1
        }
      },
      { $sort: { customerName: 1, totalSpent: -1 } }
    ]);
    
    // Summary
    const totalRevenue = customerPerformance.reduce(
      (sum, customer) => sum + customer.totalSpent,
      0
    );
    
    const totalQuantitySold = customerPerformance.reduce(
      (sum, customer) => sum + customer.totalQuantityPurchased,
      0
    );
    
    const totalTransactions = customerPerformance.reduce(
      (sum, customer) => sum + customer.totalPurchases,
      0
    );
    
    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          totalCustomers: customerPerformance.length,
          totalTransactions,
          totalQuantitySold,
          totalRevenue: Number(totalRevenue.toFixed(2))
        },
        customerPerformance,
        productsByCustomer
      }
    });
  } catch (error) {
    console.error("Get Customer Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate customer report"
    });
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


//<-----------------EXPORT SALES REPORT----------------->
const exportSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, format = "csv" } = req.query;
    
    if (!["csv", "xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: csv, xlsx, pdf"
      });
    }
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "SALE",
      ...dateFilter
    };
    
    // Get sales data
    const salesData = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          productName: "$product.name",
          category: "$product.category",
          customerName: "$customer.name",
          quantity: 1,
          unitPrice: 1,
          totalAmount: { $multiply: ["$quantity", "$unitPrice"] }
        }
      },
      { $sort: { date: -1 } }
    ]);
    
    const periodStr = startDate && endDate 
      ? `${startDate} to ${endDate}`
      : startDate 
        ? `From ${startDate}`
        : endDate 
          ? `Until ${endDate}`
          : "All Time";
    
    if (format === "csv") {
      const csvData = exportToCSV(salesData, [
        "date",
        "productName",
        "category",
        "customerName",
        "quantity",
        "unitPrice",
        "totalAmount"
      ]);
      
      setDownloadHeaders(res, "csv", `sales-report-${Date.now()}`);
      return res.send(csvData);
    }
    
    if (format === "xlsx") {
      const xlsxBuffer = await exportToXLSX(
        salesData,
        "Sales Report",
        [
          { header: "Date", key: "date", width: 12 },
          { header: "Product", key: "productName", width: 25 },
          { header: "Category", key: "category", width: 15 },
          { header: "Customer", key: "customerName", width: 20 },
          { header: "Quantity", key: "quantity", width: 10 },
          { header: "Unit Price", key: "unitPrice", width: 12 },
          { header: "Total Amount", key: "totalAmount", width: 15 }
        ]
      );
      
      setDownloadHeaders(res, "xlsx", `sales-report-${Date.now()}`);
      return res.send(xlsxBuffer);
    }
    
    if (format === "pdf") {
      const pdfBuffer = await exportToPDF(
        "Sales Report",
        salesData,
        [
          { label: "Date", key: "date" },
          { label: "Product", key: "productName" },
          { label: "Category", key: "category" },
          { label: "Customer", key: "customerName" },
          { label: "Qty", key: "quantity" },
          { label: "Unit Price", key: "unitPrice" },
          { label: "Total", key: "totalAmount" }
        ],
        {
          period: periodStr,
          generatedAt: new Date().toISOString().split("T")[0]
        }
      );
      
      setDownloadHeaders(res, "pdf", `sales-report-${Date.now()}`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error("Export Sales Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export sales report"
    });
  }
};

//<-----------------EXPORT PURCHASE REPORT----------------->
const exportPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate, format = "csv" } = req.query;
    
    if (!["csv", "xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: csv, xlsx, pdf"
      });
    }
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "PURCHASE",
      ...dateFilter
    };
    
    // Get purchase data
    const purchaseData = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          productName: "$product.name",
          category: "$product.category",
          supplierName: "$supplier.name",
          quantity: 1,
          unitPrice: 1,
          totalCost: { $multiply: ["$quantity", "$unitPrice"] }
        }
      },
      { $sort: { date: -1 } }
    ]);
    
    const periodStr = startDate && endDate 
      ? `${startDate} to ${endDate}`
      : startDate 
        ? `From ${startDate}`
        : endDate 
          ? `Until ${endDate}`
          : "All Time";
    
    if (format === "csv") {
      const csvData = exportToCSV(purchaseData, [
        "date",
        "productName",
        "category",
        "supplierName",
        "quantity",
        "unitPrice",
        "totalCost"
      ]);
      
      setDownloadHeaders(res, "csv", `purchase-report-${Date.now()}`);
      return res.send(csvData);
    }
    
    if (format === "xlsx") {
      const xlsxBuffer = await exportToXLSX(
        purchaseData,
        "Purchase Report",
        [
          { header: "Date", key: "date", width: 12 },
          { header: "Product", key: "productName", width: 25 },
          { header: "Category", key: "category", width: 15 },
          { header: "Supplier", key: "supplierName", width: 20 },
          { header: "Quantity", key: "quantity", width: 10 },
          { header: "Unit Price", key: "unitPrice", width: 12 },
          { header: "Total Cost", key: "totalCost", width: 15 }
        ]
      );
      
      setDownloadHeaders(res, "xlsx", `purchase-report-${Date.now()}`);
      return res.send(xlsxBuffer);
    }
    
    if (format === "pdf") {
      const pdfBuffer = await exportToPDF(
        "Purchase Report",
        purchaseData,
        [
          { label: "Date", key: "date" },
          { label: "Product", key: "productName" },
          { label: "Category", key: "category" },
          { label: "Supplier", key: "supplierName" },
          { label: "Qty", key: "quantity" },
          { label: "Unit Price", key: "unitPrice" },
          { label: "Total Cost", key: "totalCost" }
        ],
        {
          period: periodStr,
          generatedAt: new Date().toISOString().split("T")[0]
        }
      );
      
      setDownloadHeaders(res, "pdf", `purchase-report-${Date.now()}`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error("Export Purchase Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export purchase report"
    });
  }
};

//<-----------------EXPORT INVENTORY REPORT----------------->
const exportInventoryReport = async (req, res) => {
  try {
    const { format = "csv" } = req.query;
    
    if (!["csv", "xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: csv, xlsx, pdf"
      });
    }
    
    // Get all products with calculated inventory value
    const inventoryData = await Product.aggregate([
      {
        $project: {
          _id: 0,
          name: 1,
          sku: 1,
          category: 1,
          quantity: 1,
          lowStockThreshold: 1,
          purchasePrice: 1,
          sellingPrice: 1,
          inventoryValue: {
            $multiply: ["$quantity", "$purchasePrice"]
          },
          status: {
            $cond: [
              { $eq: ["$quantity", 0] },
              "Out of Stock",
              {
                $cond: [
                  { $lte: ["$quantity", "$lowStockThreshold"] },
                  "Low Stock",
                  "Healthy"
                ]
              }
            ]
          }
        }
      },
      { $sort: { category: 1, name: 1 } }
    ]);
    
    if (format === "csv") {
      const csvData = exportToCSV(inventoryData, [
        "name",
        "sku",
        "category",
        "quantity",
        "lowStockThreshold",
        "purchasePrice",
        "sellingPrice",
        "inventoryValue",
        "status"
      ]);
      
      setDownloadHeaders(res, "csv", `inventory-report-${Date.now()}`);
      return res.send(csvData);
    }
    
    if (format === "xlsx") {
      const xlsxBuffer = await exportToXLSX(
        inventoryData,
        "Inventory Report",
        [
          { header: "Product Name", key: "name", width: 25 },
          { header: "SKU", key: "sku", width: 15 },
          { header: "Category", key: "category", width: 15 },
          { header: "Quantity", key: "quantity", width: 10 },
          { header: "Low Stock Threshold", key: "lowStockThreshold", width: 18 },
          { header: "Purchase Price", key: "purchasePrice", width: 15 },
          { header: "Selling Price", key: "sellingPrice", width: 15 },
          { header: "Inventory Value", key: "inventoryValue", width: 15 },
          { header: "Status", key: "status", width: 12 }
        ]
      );
      
      setDownloadHeaders(res, "xlsx", `inventory-report-${Date.now()}`);
      return res.send(xlsxBuffer);
    }
    
    if (format === "pdf") {
      const pdfBuffer = await exportToPDF(
        "Inventory Report",
        inventoryData,
        [
          { label: "Product", key: "name" },
          { label: "SKU", key: "sku" },
          { label: "Category", key: "category" },
          { label: "Qty", key: "quantity" },
          { label: "Threshold", key: "lowStockThreshold" },
          { label: "Purchase Price", key: "purchasePrice" },
          { label: "Inventory Value", key: "inventoryValue" },
          { label: "Status", key: "status" }
        ],
        {
          generatedAt: new Date().toISOString().split("T")[0]
        }
      );
      
      setDownloadHeaders(res, "pdf", `inventory-report-${Date.now()}`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error("Export Inventory Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export inventory report"
    });
  }
};

//<-----------------EXPORT PROFIT & LOSS REPORT----------------->
const exportProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, format = "csv" } = req.query;
    
    if (!["csv", "xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: csv, xlsx, pdf"
      });
    }
    
    let dateFilter;
    try {
      dateFilter = buildDateFilter(startDate, endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    const matchStage = {
      type: "SALE",
      ...dateFilter
    };
    
    // Get profit/loss by product
    const plData = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: {
            productId: "$product._id",
            productName: "$product.name",
            category: "$product.category"
          },
          unitsSold: { $sum: "$quantity" },
          revenue: {
            $sum: { $multiply: ["$quantity", "$unitPrice"] }
          },
          costOfGoodsSold: {
            $sum: { $multiply: ["$quantity", "$product.purchasePrice"] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          productName: "$_id.productName",
          category: "$_id.category",
          unitsSold: 1,
          revenue: { $round: ["$revenue", 2] },
          costOfGoodsSold: { $round: ["$costOfGoodsSold", 2] },
          grossProfit: {
            $round: [{ $subtract: ["$revenue", "$costOfGoodsSold"] }, 2]
          },
          grossMargin: {
            $round: [
              {
                $cond: [
                  { $gt: ["$revenue", 0] },
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $subtract: ["$revenue", "$costOfGoodsSold"] },
                          "$revenue"
                        ]
                      },
                      100
                    ]
                  },
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
    
    const periodStr = startDate && endDate 
      ? `${startDate} to ${endDate}`
      : startDate 
        ? `From ${startDate}`
        : endDate 
          ? `Until ${endDate}`
          : "All Time";
    
    if (format === "csv") {
      const csvData = exportToCSV(plData, [
        "productName",
        "category",
        "unitsSold",
        "revenue",
        "costOfGoodsSold",
        "grossProfit",
        "grossMargin"
      ]);
      
      setDownloadHeaders(res, "csv", `profit-loss-report-${Date.now()}`);
      return res.send(csvData);
    }
    
    if (format === "xlsx") {
      const xlsxBuffer = await exportToXLSX(
        plData,
        "Profit & Loss Report",
        [
          { header: "Product", key: "productName", width: 25 },
          { header: "Category", key: "category", width: 15 },
          { header: "Units Sold", key: "unitsSold", width: 12 },
          { header: "Revenue", key: "revenue", width: 15 },
          { header: "Cost of Goods Sold", key: "costOfGoodsSold", width: 18 },
          { header: "Gross Profit", key: "grossProfit", width: 15 },
          { header: "Gross Margin %", key: "grossMargin", width: 15 }
        ]
      );
      
      setDownloadHeaders(res, "xlsx", `profit-loss-report-${Date.now()}`);
      return res.send(xlsxBuffer);
    }
    
    if (format === "pdf") {
      const pdfBuffer = await exportToPDF(
        "Profit & Loss Report",
        plData,
        [
          { label: "Product", key: "productName" },
          { label: "Category", key: "category" },
          { label: "Units Sold", key: "unitsSold" },
          { label: "Revenue", key: "revenue" },
          { label: "COGS", key: "costOfGoodsSold" },
          { label: "Gross Profit", key: "grossProfit" },
          { label: "Margin %", key: "grossMargin" }
        ],
        {
          period: periodStr,
          generatedAt: new Date().toISOString().split("T")[0]
        }
      );
      
      setDownloadHeaders(res, "pdf", `profit-loss-report-${Date.now()}`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error("Export Profit & Loss Report Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export profit & loss report"
    });
  }
};

module.exports = {
  getSalesReport,
  getPurchaseReport,
  getInventoryReport,
  getProfitLossReport,
  getSupplierReport,
  getCustomerReport,
  exportSalesReport,
  exportPurchaseReport,
  exportInventoryReport,
  exportProfitLossReport
};
