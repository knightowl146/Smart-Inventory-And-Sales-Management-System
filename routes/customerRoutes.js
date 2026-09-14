const express = require("express");

const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require("../controllers/customerController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

const router = express.Router();

router.use(requireAuth);

// An employee serving a walk-in needs to be able to add them, but editing and
// removing customer records stays with the owner.
router.post("/", can("customer:create"), createCustomer);
router.get("/", can("customer:read"), getCustomers);
router.get("/:id", can("customer:read"), getCustomerById);
router.patch("/:id", can("customer:update"), updateCustomer);
router.delete("/:id", can("customer:delete"), deleteCustomer);

module.exports = router;
