const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");


const { getDashboardStats } = require("../controllers/dashboardController.js");

// Owner dashboard - aggregate revenue and stock value. Employees use
// /api/me/summary.
router.use(requireAuth, can("analytics:read"));

router.get("/stats", getDashboardStats);

module.exports = router;