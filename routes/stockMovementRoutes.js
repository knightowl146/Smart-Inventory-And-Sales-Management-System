const express = require("express");
const router = express.Router();

const { getMovements, productMovements } = require("../controllers/stockMovementController");

router.get("/", getMovements);
router.get("/product/:id", productMovements);

module.exports = router;