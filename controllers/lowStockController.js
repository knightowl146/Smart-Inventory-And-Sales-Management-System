const Product = require("../models/Product");

const getLowStockProducts = async (req, res) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : 1;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 10;

    // Validate page and limit
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

    const skip = (page - 1) * limit;

    const filter = {
      $expr: {
        $lte: ["$quantity", "$lowStockThreshold"],
      },
    };

    const totalLowStock = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .select("name sku category quantity lowStockThreshold")
      .sort({ quantity: 1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalLowStock / limit) || 1,
        totalLowStock,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { getLowStockProducts };