const mongoose = require("mongoose");
const StockMovement = require("../models/StockMovements");
const { roleHas } = require("../middlewares/permissions");
const { renderReceipt, receiptNumberFor } = require("../services/receiptService");
const audit = require("../services/auditService");

//<---------------- GET /api/movements/:id/receipt ---------------->
/**
 * A printable receipt for one recorded sale.
 *
 * Both roles may fetch one, but an employee is scoped to sales they recorded -
 * the same `createdBy` condition the movements list uses, applied in the query
 * rather than after it.
 */
const getSaleReceipt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const filter = { _id: id, type: "SALE" };

    if (!roleHas(req.user.role, "movement:read")) {
      filter.createdBy = req.user.id;
    }

    const movement = await StockMovement.findOne(filter)
      .populate("product", "name sku")
      .populate("customer", "name phone")
      .populate("createdBy", "name role");

    if (!movement) {
      // Deliberately the same answer for "does not exist" and "not yours":
      // distinguishing them would let an employee enumerate other people's
      // sales by id.
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    const receiptNumber = receiptNumberFor(movement._id, movement.createdAt);

    const sale = {
      receiptNumber,
      date: movement.createdAt,
      product: {
        name: movement.product?.name || "Unknown product",
        sku: movement.product?.sku || "",
      },
      quantity: movement.quantity,
      unitPrice: movement.unitPrice,
      customer: movement.customer ? { name: movement.customer.name, phone: movement.customer.phone } : null,
      servedBy: movement.createdBy
        ? { name: movement.createdBy.name, role: movement.createdBy.role }
        : null,
    };

    const shop = {
      name: process.env.SHOP_NAME || "Smart Inventory",
      line1: process.env.SHOP_ADDRESS || null,
      phone: process.env.SHOP_PHONE || null,
    };

    audit.record({
      action: "receipt.print",
      entityType: "StockMovement",
      entityId: movement._id,
      meta: { receiptNumber },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${receiptNumber}.pdf"`);

    renderReceipt(sale, shop, res);
  } catch (err) {
    return next(err);
  }
};

module.exports = { getSaleReceipt };
