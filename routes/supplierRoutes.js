const express = require("express");

const {
    createSupplier,
    getSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier
} = require("../controllers/supplierController");

const router = express.Router();


// Create supplier
router.post("/", createSupplier);

// Get all suppliers
router.get("/", getSuppliers);

// Get single supplier
router.get("/:supplierId", getSupplier);

// Update supplier
router.put("/:supplierId", updateSupplier);

// Delete supplier
router.delete("/:supplierId", deleteSupplier);


module.exports = router;