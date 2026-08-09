const express = require("express");
const router = express.Router();

const {getMovements} = require("../controllers/stockMovementController");

router.get("/",getMovements);

module.exports = router;