const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            trim: true,
            lowercase: true
        },

        phone: {
            type: String,
            trim: true
        },

        address: {
            type: String,
            trim: true
        },

        /**
         * Days between placing an order with this supplier and the stock
         * arriving. This is what turns a reorder point from a guess into
         * arithmetic: you must cover expected demand over the lead time, plus a
         * buffer sized to how variable that demand is.
         *
         * 7 is a deliberately unremarkable default - long enough not to
         * under-order for a supplier nobody has configured, short enough not to
         * tie up capital. services/inventory/leadTime.js can also derive an
         * observed value from purchase history where there is enough of it.
         */
        leadTimeDays: {
            type: Number,
            default: 7,
            min: 0,
            max: 365
        }
    },
    {
        timestamps: true
    }
);

module.exports =
    mongoose.models.Supplier ||
    mongoose.model("Supplier", supplierSchema);