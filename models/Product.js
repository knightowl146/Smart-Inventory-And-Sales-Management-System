const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 100,
    },

    sku:{
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    category:{
        type: String,
        required: true,
        trim: true
    },
    purchasePrice: {
        type: Number,
        required: true,
        min: 0
    },
    sellingPrice:{
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    lowStockThreshold: {
        type: Number,
        required: true,
        min: 0,
        default: 10
    },
    description:{
        type:String,
        required: true
    }
},{timestamps: true});

module.exports = mongoose.model('Product', productSchema);