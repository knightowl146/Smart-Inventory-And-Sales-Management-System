const express = require("express");
const router = express.Router();

const { listAuditLog, listAuditActions } = require("../controllers/auditController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

router.use(requireAuth);

router.get("/", can("audit:read"), listAuditLog);
router.get("/actions", can("audit:read"), listAuditActions);

module.exports = router;
