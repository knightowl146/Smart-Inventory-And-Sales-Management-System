const express = require("express");
const router = express.Router();

const { getDashboardStats } = require("../controllers/dashboardController.js");

router.get("/stats", getDashboardStats);

module.exports = router;