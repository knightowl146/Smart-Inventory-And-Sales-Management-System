const mongoose = require("mongoose");
const User = require("../models/User");
const audit = require("../services/auditService");
const { ALL_ROLES } = require("../middlewares/permissions");
const { publicUser } = require("./authController");

/**
 * Owner-only staff management. There is no public sign-up route anywhere in
 * this API by design: the first owner is seeded from environment variables
 * (seedOwner.js) and every account after that is created from inside the app by
 * someone who is already an owner.
 */

const countActiveOwners = (excludeId) => {
  const filter = { role: "owner", isActive: true };
  if (excludeId) filter._id = { $ne: excludeId };
  return User.countDocuments(filter);
};

//<---------------- GET /api/users ---------------->
const listUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email");

    return res.status(200).json({
      success: true,
      data: users.map((user) => ({
        ...publicUser(user),
        createdAt: user.createdAt,
        createdBy: user.createdBy
          ? { name: user.createdBy.name, email: user.createdBy.email }
          : null,
      })),
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/users ---------------->
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (typeof password !== "string" || password.length < User.MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${User.MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const requestedRole = role || "employee";

    if (!ALL_ROLES.includes(requestedRole)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${ALL_ROLES.join(", ")}`,
      });
    }

    const normalisedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalisedEmail });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with that email already exists",
      });
    }

    const user = new User({
      name: String(name).trim(),
      email: normalisedEmail,
      role: requestedRole,
      createdBy: req.user.id,
    });

    await user.setPassword(password);
    await user.save();

    audit.record({
      action: "user.create",
      entityType: "User",
      entityId: user._id,
      after: { email: user.email, role: user.role, name: user.name },
    });

    return res.status(201).json({ success: true, data: publicUser(user) });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next(err);
  }
};

//<---------------- PATCH /api/users/:id ---------------->
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const user = await User.findById(id).select("+sessions");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { name, role, isActive } = req.body || {};
    const before = { name: user.name, role: user.role, isActive: user.isActive };

    if (role !== undefined && !ALL_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${ALL_ROLES.join(", ")}`,
      });
    }

    const isSelf = user._id.toString() === req.user.id;

    // Two guards that keep an owner from locking everybody out of the system,
    // including themselves.
    if (isSelf && (role === "employee" || isActive === false)) {
      return res.status(400).json({
        success: false,
        message: "You cannot demote or deactivate your own account",
      });
    }

    const losingOwnership =
      user.role === "owner" && (role === "employee" || isActive === false);

    if (losingOwnership && (await countActiveOwners(user._id)) === 0) {
      return res.status(400).json({
        success: false,
        message: "There must be at least one active owner",
      });
    }

    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined) user.role = role;

    if (isActive !== undefined) {
      user.isActive = Boolean(isActive);

      // Deactivating has to take effect now, not whenever the current access
      // token happens to expire.
      if (!user.isActive) {
        user.sessions = [];
        user.tokenVersion += 1;
      }
    }

    // A role change must also invalidate existing tokens, otherwise a demoted
    // owner keeps owner permissions until their access token expires.
    if (role !== undefined && role !== before.role) {
      user.sessions = [];
      user.tokenVersion += 1;
    }

    await user.save();

    const after = { name: user.name, role: user.role, isActive: user.isActive };
    audit.record({
      action: "user.update",
      entityType: "User",
      entityId: user._id,
      ...audit.diff(before, after, ["name", "role", "isActive"]),
    });

    return res.status(200).json({ success: true, data: publicUser(user) });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/users/:id/password ---------------->
const resetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    if (typeof newPassword !== "string" || newPassword.length < User.MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${User.MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await User.findById(id).select("+passwordHash +sessions");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.setPassword(newPassword);
    user.sessions = [];
    user.tokenVersion += 1;
    await user.save();

    audit.record({
      action: "user.reset_password",
      entityType: "User",
      entityId: user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset. That user has been signed out everywhere.",
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- DELETE /api/users/:id ---------------->
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === "owner" && (await countActiveOwners(user._id)) === 0) {
      return res.status(400).json({
        success: false,
        message: "There must be at least one active owner",
      });
    }

    await user.deleteOne();

    audit.record({
      action: "user.delete",
      entityType: "User",
      entityId: user._id,
      before: { email: user.email, role: user.role, name: user.name },
    });

    return res.status(200).json({ success: true, message: "User deleted" });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
};
