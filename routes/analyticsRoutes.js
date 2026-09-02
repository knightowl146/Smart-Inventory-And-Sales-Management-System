const express = require("express");
const router = express.Router();

const {
    getSalesAnalytics,
    getPurchaseAnalytics,
    getSalesOverTime,
    getPurchaseOverTime,
    getTopSellingProducts,
    getProductAnalytics,
    getSalesVsPurchases,
    getSalesByCategory,
    getPurchasesByCategory,
    getInventoryByCategory,
    getInventoryHealth,getProfitLoss,getProfitLossOverTime,
    getProfitLossByProduct,
    getInventoryAlerts,
    getInventoryTurnover,
    getDeadStock,
    getProductMovement,
    getSupplierPerformance,
    getCustomerAnalytics,
    getTopCustomers,getCustomerPurchaseHistory,
    getCustomerSpendingOverTime,
    getSalesGrowth,getSalesTrend,getInventoryValuation,
    getInventoryValuationByCategory,getABCInventoryAnalysis,
    getStockRecommendationMetrics,
    getDashboardSummary,
    getSingleProductRecommendation
} = require("../controllers/analyticsController");

router.get("/sales", getSalesAnalytics);
router.get("/purchases", getPurchaseAnalytics);

router.get("/sales-over-time", getSalesOverTime);
router.get("/purchases-over-time", getPurchaseOverTime);
router.get("/sales-vs-purchases", getSalesVsPurchases);

router.get("/top-selling-products", getTopSellingProducts);
router.get("/products/:productId", getProductAnalytics);

router.get("/sales-by-category",getSalesByCategory);
router.get("/purchases-by-category",getPurchasesByCategory);
router.get("/inventory-by-category",getInventoryByCategory);
router.get("/inventory-health",getInventoryHealth);
router.get("/profit-loss", getProfitLoss);
router.get("/profit-loss-over-time", getProfitLossOverTime);
router.get("/profit-loss/products", getProfitLossByProduct);
router.get("/inventory-alerts", getInventoryAlerts);
router.get("/inventory-turnover",getInventoryTurnover);
router.get("/dead-stock", getDeadStock);
router.get("/product-movement", getProductMovement);
router.get("/supplier-performance",getSupplierPerformance);
router.get("/customer",getCustomerAnalytics);
router.get("/customer/top",getTopCustomers);
router.get("/customer/:customerId/purchase-history",getCustomerPurchaseHistory);
router.get("/customer/:customerId/spending-over-time",getCustomerSpendingOverTime);
router.get("/sales-growth",getSalesGrowth);
router.get("/sales-trend",getSalesTrend);
router.get("/inventory-valuation",getInventoryValuation);
router.get("/inventory-valuation/category",getInventoryValuationByCategory);
router.get("/inventory/abc-analysis",getABCInventoryAnalysis);
router.get("/inventory/stock-recommendations", getStockRecommendationMetrics);
router.get("/inventory/stock-recommendations/:productId", getSingleProductRecommendation);
router.get("/dashboard/summary", getDashboardSummary);


module.exports = router;