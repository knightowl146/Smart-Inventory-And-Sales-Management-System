const express = require("express");

const {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controllers/supplierController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

const router = express.Router();

router.use(requireAuth);

// Suppliers are entirely owner territory: the records carry purchasing terms
// and the analytics built on them expose what the business pays.
router.post("/", can("supplier:create"), createSupplier);
router.get("/", can("supplier:read"), getSuppliers);
router.get("/:supplierId", can("supplier:read"), getSupplier);
router.put("/:supplierId", can("supplier:update"), updateSupplier);
router.delete("/:supplierId", can("supplier:delete"), deleteSupplier);

module.exports = router;
