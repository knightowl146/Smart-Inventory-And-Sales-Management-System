const mongoose = require("mongoose");

const stockMovementsSchema = new mongoose.Schema(
    {
        product:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        type:{
            type: String,
            enum:["PURCHASE","SALE"],
            required: true,
        },

        quantity:{
            type: Number,
            required: true,
            min: 1
        },
        unitPrice:{
            type: Number,
            required: true,
            min: 0
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: function () {
                return this.type === "PURCHASE";
            }
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: function () {
                return this.type === "SALE";
            }
        },

        prevQuantity:{
            type: Number,
            required: true
        },

        newQuantity:{
            type: Number,
            required: true
        },

        /**
         * Who recorded this movement.
         *
         * Nullable on purpose: rows created by the seed scripts before
         * authentication existed have no actor, and making this required would
         * have meant a data migration to add the feature. New movements always
         * carry it, which is what lets an employee be scoped to their own
         * ledger and what the planned anomaly detection keys off.
         */
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.models.StockMovement || mongoose.model("StockMovement", stockMovementsSchema);