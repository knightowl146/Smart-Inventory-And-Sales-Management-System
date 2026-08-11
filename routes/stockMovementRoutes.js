const express = require("express");
const router = express.Router();

const { getMovements, productMovements } = require("../controllers/stockMovementController");
const { getLowStockProducts } = require("../controllers/lowStockController");

router.get("/", getMovements);
router.get("/product/:id", productMovements);
router.get("/low-stock", getLowStockProducts);

module.exports = router;