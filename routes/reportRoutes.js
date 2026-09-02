const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/reportController");

// Sales Report
router.get("/sales", getSalesReport);
router.get("/sales/export", exportSalesReport);

// Purchase Report
router.get("/purchases", getPurchaseReport);
router.get("/purchases/export", exportPurchaseReport);

// Inventory Report
router.get("/inventory", getInventoryReport);
router.get("/inventory/export", exportInventoryReport);

// Profit & Loss Report
router.get("/profit-loss", getProfitLossReport);
router.get("/profit-loss/export", exportProfitLossReport);

// Supplier Report
router.get("/suppliers", getSupplierReport);

// Customer Report
router.get("/customers", getCustomerReport);

module.exports = router;
