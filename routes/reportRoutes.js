const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");


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
/**
 * Owner-only, including the CSV/Excel/PDF exports.
 *
 * The exports matter more than they look: they stream a file straight from the
 * documents, so they never pass through res.json and the response filter that
 * strips cost fields cannot touch them. Locking the whole router down is what
 * keeps that from being a hole.
 */
router.use(requireAuth, can("report:read"));

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
