const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");

//<------------CREATE PRODUCT----------->
const createProduct = async (req, res) => {
  try {
    // Destructure req.body
    const { name, sku, category, purchasePrice, sellingPrice,quantity, lowStockThreshold, description } = req.body || {};
    // Validation
    if (!name || !sku || !category || purchasePrice == null || sellingPrice == null || unitPrice == null || quantity == null || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    //Validation for prices and quantities
    if(quantity<=0 || !Number.isInteger(quantity) || purchasePrice<=0 || sellingPrice<=0 || !Number.isInteger(purchasePrice) || !Number.isInteger(sellingPrice) ){
      return res.status(400).json({
        success: false,
        message: "Quantity and prices must be positive integers",
      });
    }
    if(lowStockThreshold !== undefined && lowStockThreshold !== null && (typeof lowStockThreshold !== "number" || lowStockThreshold < 0)){
      return res.status(400).json({
        success: false,
        message: "Low Stock threshold must be greater than or equal to 0"
      });
    }
    // Check for duplicate sku
    const exist = await Product.find({sku});
    if (exist.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Product already exists",
      });
    }
    // MongoDB query to create a new product
    const product = await Product.create({
      name,
      sku,
      category,
      purchasePrice,
      sellingPrice,
      unitPrice,
      quantity,
      lowStockThreshold,
      description,
    });
    // Respond with success message
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    // Error handling
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

//<-----------GET ALL PRODUCTS------------->
const getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;

    const page = req.query.page !== undefined ? Number(req.query.page) : 1;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 10;

    // Pagination Validation
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

    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      data: products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit) || 1,
        totalProducts: totalProducts,
        limit: limit,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//<-------------SEARCH PRODUCT BY ID--------------->
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    //Validating id
    const isValid = mongoose.Types.ObjectId.isValid(id);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }
    const product = await Product.findById(id);

    // Product doesn't exist
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product doesn't exist",
      });
    }
    //Product found
    return res.status(200).json({
      success: true,
      message: "Product found!",
      data: product,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//<------------------UPDATE PRODUCT----------------->
const updateProduct = async (req, res) => {
  try {
    // Validating id
    const isValid = mongoose.Types.ObjectId.isValid(req.params.id);
    if (!isValid) {
      return res.status(404).json({
        success: false,
        message: "Invalid id",
      });
    }
    // Validating requested updates
    const allowedUpdates = new Set(["name", "price", "purchasePrice", "sellingPrice","quantity", "category", "lowStockThreshold" ,"description"]);
    const updates = Object.keys(req.body || {});
    const isValidUpdate = updates.every((field) => allowedUpdates.has(field));
    if (!isValidUpdate) {
      return res.status(400).json({
        success: false,
        message: "Invalid updates",
      });
    }
    if (req.body?.lowStockThreshold !== undefined && req.body?.lowStockThreshold !== null && (typeof req.body.lowStockThreshold !== "number" || req.body.lowStockThreshold < 0)) {
      return res.status(400).json({
        success: false,
        message: "Low Stock threshold must be greater than or equal to 0",
      });
    }
    // Updating product
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Product not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Product updated",
      data: product,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//<----------DELETE PRODUCT----------->
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const isValid = mongoose.Types.ObjectId.isValid(id);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Product deleted",
      data: product,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//<-----------------PURCHASE PRODUCT--------------->
const purchaseProduct = async (req, res) => {
  try {
    const { quantity,unitPrice } = req.body || {};
    const { id } = req.params;
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    if (!isValidId) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }
    if (typeof unitPrice !== "number" || isNaN(unitPrice)) {
      return res.status(400).json({
        success: false,
        message: "Unit price is required and must be a number",
      });
    }
    if (unitPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Unit price cannot be negative",
  });
}
    if (typeof quantity !== "number" || isNaN(quantity)) {
      return res.status(400).json({
        success: false,
        message: "Quantity is required and must be a number",
      });
    }
    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0",
      });
    }
    if (!Number.isInteger(quantity)) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be an integer",
      });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { $inc: { quantity: quantity } },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const newQuantity = product.quantity;
    const prevQuantity = newQuantity - quantity;

    await StockMovement.create({
      product: product._id,
      type: "PURCHASE",
      quantity: quantity,
      unitPrice: unitPrice,
      prevQuantity: prevQuantity,
      newQuantity: newQuantity,
    });

    return res.status(200).json({
      success: true,
      message: "Stock added successfully",
      data: product,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//<-----------------SELL PRODUCT--------------->
const sellProduct = async (req, res) => {
  try {
    const { quantity,unitPrice } = req.body || {};
    const { id } = req.params;
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    if (!isValidId) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }
    if (typeof unitPrice !== "number" || isNaN(unitPrice)) {
      return res.status(400).json({
        success: false,
        message: "Unit price is required and must be a number",
      });
    }
    if (unitPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Unit price cannot be negative",
      });
    }
    if (typeof quantity !== "number" || isNaN(quantity)) {
      return res.status(400).json({
        success: false,
        message: "Quantity is required and must be a number",
      });
    }
    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0",
      });
    }
    if (!Number.isInteger(quantity)) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be an integer",
      });
    }

    // Filter checks if stock is sufficient before updating
    const product = await Product.findOneAndUpdate(
      { _id: id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true, runValidators: true }
    );

    // product == null when the filter rejects the sale
    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock or product not found",
      });
    }

    const newQuantity = product.quantity;
    const prevQuantity = newQuantity + quantity;

    await StockMovement.create({
      product: product._id,
      type: "SALE",
      quantity: quantity,
      unitPrice: unitPrice,
      prevQuantity: prevQuantity,
      newQuantity: newQuantity,
    });

    return res.status(200).json({
      success: true,
      message: "Product sold successfully",
      data: product,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  purchaseProduct,
  sellProduct,
};
