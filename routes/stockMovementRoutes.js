const express = require("express");
const router = express.Router();

const { getMovements, productMovements } = require("../controllers/stockMovementController");
const { getLowStockProducts } = require("../controllers/lowStockController");
const { getSaleReceipt } = require("../controllers/receiptController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

router.use(requireAuth);

/**
 * Two permissions, either of which opens the door. The controller then reads
 * req.user.role to decide the scope: an owner sees the whole ledger, an
 * employee sees only movements they created. Enforcing the narrowing in the
 * query rather than by filtering the response means the rows never leave Mongo.
 */
const readMovements = can(["movement:read", "movement:read:own"]);

router.get("/", readMovements, getMovements);
router.get("/product/:id", readMovements, productMovements);

// Low stock is operational, not financial - the shop floor needs it.
router.get("/low-stock", can("product:read"), getLowStockProducts);

/**
 * A receipt for a recorded sale. Both roles may print one - an employee at the
 * counter is exactly who needs it - and the controller scopes an employee to
 * their own sales using the same createdBy condition as the list above.
 */
router.get("/:id/receipt", can(["movement:read", "movement:read:own"]), getSaleReceipt);

module.exports = router;
