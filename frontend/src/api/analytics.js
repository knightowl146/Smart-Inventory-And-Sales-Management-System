import apiClient from "./client";

const get = (path, params) => apiClient.get(`/analytics${path}`, { params });

export const getDashboardSummary = (params) => get("/dashboard/summary", params);

export const getSalesAnalytics = (params) => get("/sales", params);
export const getSalesOverTime = (params) => get("/sales-over-time", params);
export const getSalesVsPurchases = (params) => get("/sales-vs-purchases", params);
export const getSalesByCategory = (params) => get("/sales-by-category", params);
export const getSalesGrowth = (params) => get("/sales-growth", params);
export const getSalesTrend = (params) => get("/sales-trend", params);
export const getTopSellingProducts = (params) => get("/top-selling-products", params);

export const getPurchaseAnalytics = (params) => get("/purchases", params);
export const getPurchaseOverTime = (params) => get("/purchases-over-time", params);
export const getPurchasesByCategory = (params) => get("/purchases-by-category", params);

export const getInventoryByCategory = (params) => get("/inventory-by-category", params);
export const getInventoryHealth = (params) => get("/inventory-health", params);
export const getInventoryAlerts = (params) => get("/inventory-alerts", params);
export const getInventoryTurnover = (params) => get("/inventory-turnover", params);
export const getInventoryValuation = (params) => get("/inventory-valuation", params);
export const getInventoryValuationByCategory = (params) => get("/inventory-valuation/category", params);
export const getABCAnalysis = (params) => get("/inventory/abc-analysis", params);
export const getDeadStock = (params) => get("/dead-stock", params);
export const getProductMovement = (params) => get("/product-movement", params);

export const getProfitLoss = (params) => get("/profit-loss", params);
export const getProfitLossOverTime = (params) => get("/profit-loss-over-time", params);
export const getProfitLossByProduct = (params) => get("/profit-loss/products", params);

export const getProductAnalytics = (productId, params) => get(`/products/${productId}`, params);

export const getSupplierPerformance = (params) => get("/supplier-performance", params);

export const getCustomerAnalytics = (params) => get("/customer", params);
export const getTopCustomers = (params) => get("/customer/top", params);
export const getCustomerPurchaseHistory = (customerId, params) =>
  get(`/customer/${customerId}/purchase-history`, params);
export const getCustomerSpendingOverTime = (customerId, params) =>
  get(`/customer/${customerId}/spending-over-time`, params);

export const getStockRecommendations = (params) => get("/inventory/stock-recommendations", params);
export const getSingleProductRecommendation = (productId, params) =>
  get(`/inventory/stock-recommendations/${productId}`, params);