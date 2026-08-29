const express = require("express");
const router = express.Router();

const {
    getSalesAnalytics,
    getPurchaseAnalytics,
    getSalesOverTime,
    getPurchaseOverTime,
    getTopSellingProducts
} = require("../controllers/analyticsController");

router.get("/sales", getSalesAnalytics);
router.get("/purchases", getPurchaseAnalytics);

router.get("/sales-over-time", getSalesOverTime);
router.get("/purchases-over-time", getPurchaseOverTime);

router.get("/top-selling-products", getTopSellingProducts);

module.exports = router;