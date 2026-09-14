const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

//<---------------- GET /api/audit ---------------->
const listAuditLog = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer",
      });
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be an integer between 1 and 100",
      });
    }

    const { action, actorId, outcome, from, to } = req.query;
    const filter = {};

    if (action) filter.action = action;
    if (outcome) {
      if (!["success", "failure"].includes(outcome)) {
        return res.status(400).json({
          success: false,
          message: "Outcome must be either success or failure",
        });
      }
      filter.outcome = outcome;
    }

    if (actorId) {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return res.status(400).json({ success: false, message: "Invalid actorId" });
      }
      filter["actor.id"] = new mongoose.Types.ObjectId(actorId);
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid 'from' date" });
        }
        filter.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid 'to' date" });
        }
        filter.createdAt.$lte = toDate;
      }
    }

    const skip = (page - 1) * limit;

    const [total, entries] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalEntries: total,
        limit,
      },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/audit/actions ---------------->
/** Distinct action names, so the UI filter does not need a hardcoded list. */
const listAuditActions = async (req, res, next) => {
  try {
    const actions = await AuditLog.distinct("action");
    return res.status(200).json({ success: true, data: actions.sort() });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listAuditLog, listAuditActions };
