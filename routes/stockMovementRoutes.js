const express = require("express");
const router = express.Router();

const {getMovements} = require("../controllers/stockMovementController");

router.get("/",getMovements);
router.get("/product/:id",getProductMovements);

module.exports = router;