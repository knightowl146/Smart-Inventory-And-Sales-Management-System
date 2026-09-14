const express = require("express");
const router = express.Router();

const { getMySummary } = require("../controllers/meController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

router.use(requireAuth);

// Available to both roles; for an employee this is their whole dashboard.
router.get("/summary", can(["me:read", "analytics:read"]), getMySummary);

module.exports = router;
