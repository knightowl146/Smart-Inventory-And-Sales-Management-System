const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");
const Supplier = require("../models/Supplier");
const Customer = require("../models/Customer");

//<------------CREATE PRODUCT----------->
const createProduct = async (req, res) => {
  try {
    // Destructure req.body
    const { name, sku, category, purchasePrice, sellingPrice, unitPrice, quantity, lowStockThreshold, description } = req.body || {};
    // Validation
    if (!name || !sku || !category || purchasePrice == null || sellingPrice == null || unitPrice == null || quantity == null || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    //Validation for prices and quantities
    if(quantity<0 || !Number.isInteger(quantity) || purchasePrice<=0 || sellingPrice<=0 || !Number.isInteger(purchasePrice) || !Number.isInteger(sellingPrice) ){
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
      returnDocument: 'after',
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
  const session = await mongoose.startSession();

  try {
    const { quantity, unitPrice, supplierId } = req.body || {};
    const { id } = req.params;

    // Validate product ID
    const isValidId = mongoose.Types.ObjectId.isValid(id);

    if (!isValidId) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    // Validate supplier ID
    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({
        success: false,
        message: "Valid supplier ID is required",
      });
    }

    // Validate unit price
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

    // Validate quantity
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

    // Check if supplier exists
    const supplier = await Supplier.findById(supplierId);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    session.startTransaction();

    // Atomically increment product quantity, inside the transaction
    const product = await Product.findByIdAndUpdate(
      id,
      { $inc: { quantity: quantity } },
      { new: true, runValidators: true, session }
    );

    if (!product) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const newQuantity = product.quantity;
    const prevQuantity = newQuantity - quantity;

    // Record stock movement inside the same transaction
    await StockMovement.create(
      [
        {
          product: product._id,
          type: "PURCHASE",
          quantity: quantity,
          unitPrice: unitPrice,
          supplier: supplier._id,
          prevQuantity: prevQuantity,
          newQuantity: newQuantity,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Stock added successfully",
      data: product,
    });

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

//<-----------------SELL PRODUCT--------------->
const sellProduct = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { quantity, unitPrice, customerId } = req.body || {};
    const { id } = req.params;

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    // Validate customer ID
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    // Validate unit price
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

    // Validate quantity
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

    // Check customer exists
    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    session.startTransaction();

    // Atomically decrement only if sufficient stock exists, inside the transaction
    const product = await Product.findOneAndUpdate(
      {
        _id: id,
        quantity: { $gte: quantity },
      },
      {
        $inc: { quantity: -quantity },
      },
      {
        new: true,
        runValidators: true,
        session,
      }
    );

    // product == null when filter rejects the sale (insufficient stock or missing product)
    if (!product) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Insufficient stock or product not found",
      });
    }

    const newQuantity = product.quantity;
    const prevQuantity = newQuantity + quantity;

    // Record stock movement inside the same transaction
    await StockMovement.create(
      [
        {
          product: product._id,
          type: "SALE",
          quantity: quantity,
          unitPrice: unitPrice,
          customer: customer._id,
          prevQuantity: prevQuantity,
          newQuantity: newQuantity,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Product sold successfully",
      data: product,
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
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
