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
        }
    },
    {
        timestamps: true
    }
);

module.exports =
    mongoose.models.Supplier ||
    mongoose.model("Supplier", supplierSchema);