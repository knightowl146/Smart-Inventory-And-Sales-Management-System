const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },

        email: {
            type: String,
            trim: true,
            lowercase: true
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
    mongoose.models.Customer ||
    mongoose.model("Customer", customerSchema);