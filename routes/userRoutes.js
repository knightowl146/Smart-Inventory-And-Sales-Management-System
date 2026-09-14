const express = require("express");
const router = express.Router();

const {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} = require("../controllers/userController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

/**
 * Guards live inside the router, not at the mount point in app.js. That way a
 * router can only ever be mounted with its protection attached - which is the
 * mistake this codebase was previously one line away from making, since several
 * routers used to be mounted at two paths each.
 */
router.use(requireAuth);

router.get("/", can("user:read"), listUsers);
router.post("/", can("user:create"), createUser);
router.patch("/:id", can("user:update"), updateUser);
router.post("/:id/password", can("user:update"), resetUserPassword);
router.delete("/:id", can("user:delete"), deleteUser);

module.exports = router;
