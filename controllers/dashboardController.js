const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");

const getDashboardStats = async (req, res) => {
    try {

        const productStats = await Product.aggregate([
            {
                $group: {
                    _id: null,

                    totalProducts: { $sum: 1 },
                    totalQuantity: { $sum: "$quantity" },
                    lowStockProducts: {
                        $sum: {
                            $cond: [
                                {
                                    $lte: ["$quantity", "$lowStockThreshold"]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    outOfStockProducts: {
                        $sum: {
                            $cond: [
                                { $eq: ["$quantity", 0] },
                                1,
                                0
                            ]
                        }
                    },
                    inventoryValue: {
                        $sum: {
                            $multiply: [
                                "$quantity",
                                "$purchasePrice"
                            ]
                        }
                    }
                }
            }
        ]);

        const movementStats = await StockMovement.aggregate([
            {
                $group: {
                    _id: null,

                    totalPurchases: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "PURCHASE"] },
                                "$quantity",
                                0
                            ]
                        }
                    },
                    totalSales: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "SALE"] },
                                "$quantity",
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const products = productStats[0] || {
            totalProducts: 0,
            totalQuantity: 0,
            lowStockProducts: 0,
            outOfStockProducts: 0,
            inventoryValue: 0
        };
        const movements = movementStats[0] || {
            totalPurchases: 0,
            totalSales: 0
        };

        res.status(200).json({
            message: "Dashboard stats",
            stats: {
                totalProducts: products.totalProducts,
                totalQuantity: products.totalQuantity,
                lowStockProducts: products.lowStockProducts,
                outOfStockProducts: products.outOfStockProducts,
                inventoryValue: products.inventoryValue,
                totalPurchases: movements.totalPurchases,
                totalSales: movements.totalSales
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = { getDashboardStats };