const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovements = require("../models/StockMovements");
const Customer = require("../models/Customer");
const { generateStockRecommendations,validateRecommendations,calculateBaseReorderQuantity,calculateRecommendedQuantity } = require("../services/stockRecommendation");

//<-------------SALES ANALYTICS--------------->
const getSalesAnalytics = async (req,res)=>{
    try{

        const {startDate,endDate} = req.query;
        const matchStage = {
            type: "SALE"
        };
        
        if(startDate || endDate){
            matchStage.createdAt = {};

            if(startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }
            if(endDate) {
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                matchStage.createdAt.$lte = end;
            }
        }
        const result = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: null,
                    totalUnitsSold: {$sum: "$quantity"},
                    totalRevenue: {$sum: {$multiply: ["$quantity", "$unitPrice"]}}
                }
            }
        ]);

        //<-----SALES OVER TIME------>

        const salesOverTime = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt"
                        }
                    },
                    unitsSold: {
                        $sum: "$quantity"
                    },
                    revenue: {
                        $sum: {
                            $multiply: ["$quantity","$unitPrice"]
                        }
                    }
                }
            },
            {
                $sort: {
                    _id: -1
                }
            },
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    unitsSold: 1,
                    revenue: 1
                }
            }
        ]);
        const analytics = result[0] || {
            totalUnitsSold: 0,
            totalRevenue: 0
        };
        delete analytics._id;
        return res.status(200).json({
            success: true,
            message: "Sales analytics fetched successfully",
            data: {...analytics,salesOverTime}
        });
    }catch(error){
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

//<------------PURCHASE ANALYTICS------------->
const getPurchaseAnalytics = async (req,res)=>{
    try{
        const {startDate,endDate} = req.query;
        const matchStage = {
            type: "PURCHASE"
        };
        
        if(startDate || endDate){
            matchStage.createdAt = {};

            if(startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }
            if(endDate) {
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                matchStage.createdAt.$lte = end;
            }
        }
        const result = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: null,
                    totalUnitsPurchased: {$sum: "$quantity"},
                    totalPurchaseCost: {
                        $sum: {
                            $multiply: ["$quantity","$unitPrice"]
                        }
                    }
                }
            }
        ]);
        const purchaseOverTime = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt"
                        }
                    },
                    unitsPurchased: {
                        $sum: "$quantity"
                    },
                    totalPurchaseCost: {
                        $sum: {
                            $multiply: ["$quantity", "$unitPrice"]
                        }
                    }
                }
            },
            {
                $sort: {
                    _id: -1
                }
            },
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    unitsPurchased: 1,
                    totalPurchaseCost: 1
                }
            }
        ])
        const analytics = result[0] || {
            totalUnitsPurchased: 0,
            totalPurchaseCost: 0
        };
        delete analytics._id;
        return res.status(200).json({
            success: true,
            message: "Purchase analytics fetched successfully",
            data: {...analytics, purchaseOverTime}
        });
    }catch(error){
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

//<----------TOP SELLING PRODUCTS---------->
const getTopSellingProducts = async(req,res) => {
    try{
        const {startDate,endDate} = req.query;
        let limit = parseInt(req.query.limit) || 5;

        // Keep limit within a reasonable range
        limit = Math.min(Math.max(limit, 1), 100);
        const pipeline =[];

        // Date filtering
        if(startDate || endDate){
            const matchStage = {};
            matchStage.createdAt = {};

            if(startDate){
                matchStage.createdAt.$gte = new Date(startDate);
            }
            if(endDate){
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                matchStage.createdAt.$lte = end;
            }
            pipeline.push({
                $match: matchStage
            });
        }

        // Filter to SALE movements only
        pipeline.push({ $match: { type: "SALE" } });

        // Group all sales of the same product
        // Schema is flat: each StockMovements doc has a single product, quantity, unitPrice
        pipeline.push(
        {
            $group: {
                _id: "$product",

                quantitySold: {
                    $sum: "$quantity"
                },

                revenue: {
                    $sum: {
                        $multiply: ["$quantity", "$unitPrice"]
                    }
                },
                salesCount: {
                    $sum: 1
                }
            }
        },
        // get product details
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
            }
        },
        // flatten the joined product array
        {
            $unwind: "$product"
        },
        {
            $sort: {
                quantitySold: -1
            }
        },
        // return top N products only
        {
            $limit: limit
        },
        // Shape final response
        {
            $project: {
                _id: 0,

                product: {
                    _id: "$product._id",
                    name: "$product.name"
                },
                quantitySold: 1,
                revenue: 1,
                salesCount: 1
            }
        });

        const topSellingProducts = await StockMovements.aggregate(pipeline);
        return res.status(200).json({
            success: true,
            message: "Top selling products fetched successfully",
            count: topSellingProducts.length,
            data: topSellingProducts
        });
    }catch(error){
        return res.status(500).json({
            success: false,
            message: error.message,
        })
    }
}

// Standalone wrappers for over-time endpoints
const getSalesOverTime = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const matchStage = { type: "SALE" };

        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const salesOverTime = await StockMovements.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    unitsSold: { $sum: "$quantity" },
                    revenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } }
                }
            },
            { $sort: { _id: -1 } },
            { $project: { _id: 0, date: "$_id", unitsSold: 1, revenue: 1 } }
        ]);

        return res.status(200).json({
            success: true,
            message: "Sales over time fetched successfully",
            data: salesOverTime
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
//<-----------PURCHASE OVER TIME------------->
const getPurchaseOverTime = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const matchStage = { type: "PURCHASE" };

        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const purchaseOverTime = await StockMovements.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    unitsPurchased: { $sum: "$quantity" },
                    totalPurchaseCost: { $sum: { $multiply: ["$quantity", "$unitPrice"] } }
                }
            },
            { $sort: { _id: -1 } },
            { $project: { _id: 0, date: "$_id", unitsPurchased: 1, totalPurchaseCost: 1 } }
        ]);

        return res.status(200).json({
            success: true,
            message: "Purchases over time fetched successfully",
            data: purchaseOverTime
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
//<-----------PRODUCT ANALYTICS------------->
const getProductAnalytics = async (req,res) => {
    try {
        const {productId} = req.params;
        const {startDate,endDate} = req.query;
        // Validate id
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }
        

        const product = await Product.findById(productId).select("name sku category");
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const matchStage = { product: new mongoose.Types.ObjectId(productId) };
        if(startDate || endDate){
            matchStage.createdAt = {};
            if(startDate) matchStage.createdAt.$gte = new Date(startDate);
            if(endDate){
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                matchStage.createdAt.$lte = end;
            }
        }
        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: "$type",
                    totalQuantity: {$sum: "$quantity"},

                    totalAmount: {$sum: {$multiply: ["$quantity","$unitPrice"]}},
                    transactionCount: {$sum: 1}
                }
            }
        ]);
        let totalSold = 0;
        let totalPurchased = 0;
        let salesRevenue = 0;
        let purchaseCost = 0;
        let salesCount = 0;
        let purchaseCount = 0;

        analytics.forEach((item) => {

            if (item._id === "SALE") {
                totalSold = item.totalQuantity;
                salesRevenue = item.totalAmount;
                salesCount = item.transactionCount;
            }

            if (item._id === "PURCHASE") {
                totalPurchased = item.totalQuantity;
                purchaseCost = item.totalAmount;
                purchaseCount = item.transactionCount;
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                product,
                totalSold,
                totalPurchased,
                salesRevenue,
                purchaseCost,
                salesCount,
                purchaseCount
            }
        });
    }catch(error){
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}
//<-------- GET SALES VS PURCHASES-------->
const getSalesVsPurchases = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$createdAt"
                            }
                        },
                        type: "$type"
                    },

                    quantity: {
                        $sum: "$quantity"
                    },

                    amount: {
                        $sum: {
                            $multiply: ["$quantity", "$unitPrice"]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.date",

                    sales: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "SALE"] },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    purchases: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "PURCHASE"] },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    salesRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "SALE"] },
                                "$amount",
                                0
                            ]
                        }
                    },

                    purchaseCost: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "PURCHASE"] },
                                "$amount",
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    sales: 1,
                    purchases: 1,
                    salesRevenue: 1,
                    purchaseCost: 1
                }
            },
            {
                $sort: {
                    date: 1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error("Get Sales vs Purchases Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch sales vs purchases analytics"
        });
    }
};
//<-----GET SALES BY CATEGORY------>
const getSalesByCategory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {
            type: "SALE"
        };

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },

            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "product"
                }
            },

            {
                $unwind: "$product"
            },

            {
                $group: {
                    _id: "$product.category",

                    quantitySold: {
                        $sum: "$quantity"
                    },

                    revenue: {
                        $sum: {
                            $multiply: ["$quantity", "$unitPrice"]
                        }
                    },

                    salesCount: {
                        $sum: 1
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    category: "$_id",
                    quantitySold: 1,
                    revenue: 1,
                    salesCount: 1
                }
            },

            {
                $sort: {
                    revenue: -1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error("Get Sales By Category Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch sales by category"
        });
    }
};
//<-----GET PURCHASES BY CATEGORY----->
const getPurchasesByCategory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {
            type: "PURCHASE"
        };

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },

            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "product"
                }
            },

            {
                $unwind: "$product"
            },

            {
                $group: {
                    _id: "$product.category",

                    quantityPurchased: {
                        $sum: "$quantity"
                    },

                    purchaseCost: {
                        $sum: {
                            $multiply: ["$quantity", "$unitPrice"]
                        }
                    },

                    purchaseCount: {
                        $sum: 1
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    category: "$_id",
                    quantityPurchased: 1,
                    purchaseCost: 1,
                    purchaseCount: 1
                }
            },

            {
                $sort: {
                    purchaseCost: -1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error("Get Purchases By Category Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch purchases by category"
        });
    }
};
//<-----GET INVENTORY BY CATEGORY------>
const getInventoryByCategory = async (req, res) => {
    try {

        const analytics = await Product.aggregate([
            {
                $group: {
                    _id: "$category",

                    quantity: {
                        $sum: "$quantity"
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
            },

            {
                $project: {
                    _id: 0,
                    category: "$_id",
                    quantity: 1,
                    inventoryValue: 1
                }
            },

            {
                $sort: {
                    inventoryValue: -1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error("Get Inventory By Category Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch inventory by category"
        });
    }
};
//<----------INVENTORY HEALTH--------------->
const getInventoryHealth = async (req, res) => {
    try {

        const analytics = await Product.aggregate([
            {
                $group: {
                    _id: null,

                    totalProducts: {
                        $sum: 1
                    },

                    totalQuantity: {
                        $sum: "$quantity"
                    },

                    lowStockProducts: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gt: ["$quantity", 0] },
                                        {
                                            $lte: [
                                                "$quantity",
                                                "$lowStockThreshold"
                                            ]
                                        }
                                    ]
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
            },

            {
                $project: {
                    _id: 0,

                    totalProducts: 1,
                    totalQuantity: 1,
                    lowStockProducts: 1,
                    outOfStockProducts: 1,

                    healthyStockProducts: {
                        $subtract: [
                            "$totalProducts",
                            {
                                $add: [
                                    "$lowStockProducts",
                                    "$outOfStockProducts"
                                ]
                            }
                        ]
                    },

                    inventoryValue: 1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: analytics[0] || {
                totalProducts: 0,
                totalQuantity: 0,
                lowStockProducts: 0,
                outOfStockProducts: 0,
                healthyStockProducts: 0,
                inventoryValue: 0
            }
        });

    } catch (error) {
        console.error("Get Inventory Health Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch inventory health"
        });
    }
};
//<----------PROFIT & LOSS ANALYTICS--------------->
const getProfitLoss = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },

            {
                $group: {
                    _id: "$type",

                    totalAmount: {
                        $sum: {
                            $multiply: [
                                "$quantity",
                                "$unitPrice"
                            ]
                        }
                    }
                }
            }
        ]);

        let revenue = 0;
        let purchaseCost = 0;

        analytics.forEach((item) => {
            if (item._id === "SALE") {
                revenue = item.totalAmount;
            }

            if (item._id === "PURCHASE") {
                purchaseCost = item.totalAmount;
            }
        });

        const grossProfit = revenue - purchaseCost;

        const profitMargin = revenue > 0
            ? (grossProfit / revenue) * 100
            : 0;

        return res.status(200).json({
            success: true,
            message: "Profit and loss analytics fetched successfully",
            data: {
                revenue,
                purchaseCost,
                grossProfit,
                profitMargin
            }
        });

    } catch (error) {
        console.error("Get Profit & Loss Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit and loss analytics"
        });
    }
};
//<----------PROFIT & LOSS OVER TIME--------------->
const getProfitLossOverTime = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },

            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$createdAt"
                            }
                        },
                        type: "$type"
                    },

                    amount: {
                        $sum: {
                            $multiply: [
                                "$quantity",
                                "$unitPrice"
                            ]
                        }
                    }
                }
            },

            {
                $group: {
                    _id: "$_id.date",

                    revenue: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "SALE"] },
                                "$amount",
                                0
                            ]
                        }
                    },

                    purchaseCost: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "PURCHASE"] },
                                "$amount",
                                0
                            ]
                        }
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    revenue: 1,
                    purchaseCost: 1,

                    grossProfit: {
                        $subtract: [
                            "$revenue",
                            "$purchaseCost"
                        ]
                    }
                }
            },

            {
                $sort: {
                    date: 1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Profit and loss over time fetched successfully",
            data: analytics
        });

    } catch (error) {
        console.error("Get Profit & Loss Over Time Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit and loss over time"
        });
    }
};
//<----------PROFIT & LOSS BY PRODUCT--------------->
const getProfitLossByProduct = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};

        if (startDate || endDate) {
            matchStage.createdAt = {};

            if (startDate) {
                matchStage.createdAt.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const analytics = await StockMovements.aggregate([
            {
                $match: matchStage
            },

            {
                $group: {
                    _id: {
                        product: "$product",
                        type: "$type"
                    },

                    amount: {
                        $sum: {
                            $multiply: [
                                "$quantity",
                                "$unitPrice"
                            ]
                        }
                    }
                }
            },

            {
                $group: {
                    _id: "$_id.product",

                    revenue: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "SALE"] },
                                "$amount",
                                0
                            ]
                        }
                    },

                    purchaseCost: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.type", "PURCHASE"] },
                                "$amount",
                                0
                            ]
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            },

            {
                $unwind: "$product"
            },

            {
                $project: {
                    _id: 0,

                    product: {
                        _id: "$product._id",
                        name: "$product.name",
                        sku: "$product.sku"
                    },

                    revenue: 1,
                    purchaseCost: 1,

                    grossProfit: {
                        $subtract: [
                            "$revenue",
                            "$purchaseCost"
                        ]
                    }
                }
            },

            {
                $addFields: {
                    profitMargin: {
                        $cond: [
                            { $gt: ["$revenue", 0] },
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            "$grossProfit",
                                            "$revenue"
                                        ]
                                    },
                                    100
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            {
                $sort: {
                    grossProfit: -1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Profit and loss by product fetched successfully",
            data: analytics
        });

    } catch (error) {
        console.error("Get Profit & Loss By Product Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch profit and loss by product"
        });
    }
};
//<----------SMART INVENTORY ALERTS--------------->
const getInventoryAlerts = async (req, res) => {
    try {
        const alerts = await Product.aggregate([
            {
                $match: {
                    $or: [
                        { quantity: 0 },
                        {
                            $and: [
                                { quantity: { $gt: 0 } },
                                {
                                    $expr: {
                                        $lte: [
                                            "$quantity",
                                            "$lowStockThreshold"
                                        ]
                                    }
                                }
                            ]
                        }
                    ]
                }
            },

            {
                $project: {
                    _id: 0,

                    product: {
                        _id: "$_id",
                        name: "$name",
                        sku: "$sku"
                    },

                    quantity: 1,
                    lowStockThreshold: 1,

                    type: {
                        $cond: [
                            { $eq: ["$quantity", 0] },
                            "OUT_OF_STOCK",
                            "LOW_STOCK"
                        ]
                    },

                    severity: {
                        $cond: [
                            { $eq: ["$quantity", 0] },
                            "CRITICAL",
                            "WARNING"
                        ]
                    }
                }
            },

            {
                $sort: {
                    quantity: 1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            count: alerts.length,
            data: alerts
        });

    } catch (error) {
        console.error("Get Inventory Alerts Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch inventory alerts"
        });
    }
};
//<---------INVENTORY TURNOVER--------->
const getInventoryTurnover = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;

    const matchStage = {
      type: "SALE"
    };

    // Date filtering
    if (startDate || endDate) {
      matchStage.createdAt = {};

      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        matchStage.createdAt.$lte = end;
      }
    }

    const sales = await StockMovements.aggregate([
      {
        $match: matchStage
      },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productData"
        }
      },

      {
        $unwind: "$productData"
      },

      {
        $group: {
          _id: "$product",

          productName: {
            $first: "$productData.name"
          },

          category: {
            $first: "$productData.category"
          },

          quantitySold: {
            $sum: "$quantity"
          },

          costOfGoodsSold: {
            $sum: {
              $multiply: [
                "$quantity",
                "$productData.purchasePrice"
              ]
            }
          }
        }
      },

      {
        $sort: {
          costOfGoodsSold: -1
        }
      }
    ]);

    const products = await Product.find({})
      .select("_id name category quantity purchasePrice")
      .lean();

    const productMap = new Map();

    products.forEach((product) => {
      productMap.set(product._id.toString(), product);
    });

    const turnoverData = sales.map((sale) => {
      const product = productMap.get(
        sale._id.toString()
      );

      const currentInventoryValue = product
        ? product.quantity * product.purchasePrice
        : 0;

      const turnoverRatio =
        currentInventoryValue > 0
          ? sale.costOfGoodsSold /
            currentInventoryValue
          : 0;

      return {
        productId: sale._id,
        productName: sale.productName,
        category: sale.category,
        quantitySold: sale.quantitySold,
        costOfGoodsSold: Number(
          sale.costOfGoodsSold.toFixed(2)
        ),
        currentInventoryValue: Number(
          currentInventoryValue.toFixed(2)
        ),
        turnoverRatio: Number(
          turnoverRatio.toFixed(2)
        )
      };
    });

    const parsedLimit = Math.min(
      Math.max(parseInt(limit) || 10, 1),
      100
    );

    const limitedProducts =
      turnoverData.slice(0, parsedLimit);

    const totalCOGS = turnoverData.reduce(
      (sum, item) =>
        sum + item.costOfGoodsSold,
      0
    );

    const totalInventoryValue =
      products.reduce(
        (sum, product) =>
          sum +
          product.quantity *
            product.purchasePrice,
        0
      );

    const inventoryTurnoverRatio =
      totalInventoryValue > 0
        ? totalCOGS /
          totalInventoryValue
        : 0;

    return res.status(200).json({
      success: true,

      summary: {
        totalCOGS: Number(
          totalCOGS.toFixed(2)
        ),

        totalInventoryValue: Number(
          totalInventoryValue.toFixed(2)
        ),

        inventoryTurnoverRatio: Number(
          inventoryTurnoverRatio.toFixed(2)
        )
      },

      products: limitedProducts
    });

  } catch (error) {
    console.error(
      "Error getting inventory turnover:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get inventory turnover analytics",
      error: error.message
    });
  }
};
//<-------------DEAD STOCK--------------->
const getDeadStock = async (req, res) => {
  try {
    const {
      days = 30,
      limit = 10
    } = req.query;

    const parsedDays = Math.min(
      Math.max(parseInt(days) || 30, 1),
      3650
    );

    const parsedLimit = Math.min(
      Math.max(parseInt(limit) || 10, 1),
      100
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - parsedDays
    );

    // Find products that currently have stock
    const products = await Product.find({
      quantity: { $gt: 0 }
    })
      .select(
        "_id name category quantity purchasePrice sellingPrice"
      )
      .lean();

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        days: parsedDays,
        summary: {
          deadStockProducts: 0,
          deadStockQuantity: 0,
          deadStockValue: 0
        },
        products: []
      });
    }

    const productIds = products.map(
      (product) => product._id
    );

    // Find the latest sale for every product
    const latestSales =
      await StockMovements.aggregate([
        {
          $match: {
            type: "SALE",
            product: {
              $in: productIds
            }
          }
        },

        {
          $group: {
            _id: "$product",

            lastSaleDate: {
              $max: "$createdAt"
            },

            totalQuantitySold: {
              $sum: "$quantity"
            }
          }
        }
      ]);

    const latestSaleMap = new Map();

    latestSales.forEach((sale) => {
      latestSaleMap.set(
        sale._id.toString(),
        sale
      );
    });

    const deadStock = products
      .filter((product) => {
        const sale = latestSaleMap.get(
          product._id.toString()
        );

        // Never sold
        if (!sale) {
          return true;
        }

        // Last sale is older than cutoff
        return sale.lastSaleDate < cutoffDate;
      })
      .map((product) => {
        const sale = latestSaleMap.get(
          product._id.toString()
        );

        const inventoryValue =
          product.quantity *
          product.purchasePrice;

        const potentialRevenue =
          product.quantity *
          product.sellingPrice;

        return {
          productId: product._id,
          productName: product.name,
          category: product.category,

          quantity: product.quantity,

          purchasePrice:
            product.purchasePrice,

          sellingPrice:
            product.sellingPrice,

          inventoryValue: Number(
            inventoryValue.toFixed(2)
          ),

          potentialRevenue: Number(
            potentialRevenue.toFixed(2)
          ),

          lastSaleDate:
            sale?.lastSaleDate || null,

          daysSinceLastSale: sale
            ? Math.floor(
                (
                  Date.now() -
                  new Date(
                    sale.lastSaleDate
                  ).getTime()
                ) /
                  (1000 * 60 * 60 * 24)
              )
            : null,

          totalQuantitySold:
            sale?.totalQuantitySold || 0
        };
      });

    // Highest blocked inventory value first
    deadStock.sort(
      (a, b) =>
        b.inventoryValue -
        a.inventoryValue
    );

    const limitedProducts =
      deadStock.slice(0, parsedLimit);

    const deadStockQuantity =
      deadStock.reduce(
        (sum, product) =>
          sum + product.quantity,
        0
      );

    const deadStockValue =
      deadStock.reduce(
        (sum, product) =>
          sum + product.inventoryValue,
        0
      );

    const potentialRevenue =
      deadStock.reduce(
        (sum, product) =>
          sum + product.potentialRevenue,
        0
      );

    return res.status(200).json({
      success: true,

      days: parsedDays,

      summary: {
        deadStockProducts:
          deadStock.length,

        deadStockQuantity,

        deadStockValue: Number(
          deadStockValue.toFixed(2)
        ),

        potentialRevenue: Number(
          potentialRevenue.toFixed(2)
        )
      },

      products: limitedProducts
    });

  } catch (error) {
    console.error(
      "Error getting dead stock:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get dead stock analytics",
      error: error.message
    });
  }
};
//<-------------PRODUCT MOVEMENT------------>
const getProductMovement = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      limit = 10
    } = req.query;

    const matchStage = {
      type: "SALE"
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};

      if (startDate) {
        matchStage.createdAt.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);

        end.setHours(
          23,
          59,
          59,
          999
        );

        matchStage.createdAt.$lte = end;
      }
    }

    const parsedLimit = Math.min(
      Math.max(parseInt(limit) || 10, 1),
      100
    );

    const sales =
      await StockMovements.aggregate([
        {
          $match: matchStage
        },

        {
          $group: {
            _id: "$product",

            quantitySold: {
              $sum: "$quantity"
            },

            salesCount: {
              $sum: 1
            },

            revenue: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$unitPrice"
                ]
              }
            }
          }
        },

        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product"
          }
        },

        {
          $unwind: "$product"
        },

        {
          $project: {
            _id: 0,

            productId: "$product._id",

            productName:
              "$product.name",

            category:
              "$product.category",

            currentStock:
              "$product.quantity",

            quantitySold: 1,

            salesCount: 1,

            revenue: 1
          }
        }
      ]);

    const fastMoving = [...sales]
      .sort(
        (a, b) =>
          b.quantitySold -
          a.quantitySold
      )
      .slice(0, parsedLimit);

    const slowMoving = [...sales]
      .sort(
        (a, b) =>
          a.quantitySold -
          b.quantitySold
      )
      .slice(0, parsedLimit);

    return res.status(200).json({
      success: true,

      filters: {
        startDate:
          startDate || null,

        endDate:
          endDate || null,

        limit: parsedLimit
      },

      fastMoving,

      slowMoving
    });

  } catch (error) {
    console.error(
      "Error getting product movement:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get product movement analytics",
      error: error.message
    });
  }
};
//<----------SUPPLIER PERFORMANCE---------->
const getSupplierPerformance = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      limit = 10
    } = req.query;

    const matchStage = {
      type: "PURCHASE",
      supplier: {
        $ne: null
      }
    };

    // Date filtering
    if (startDate || endDate) {
      matchStage.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate"
          });
        }

        matchStage.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate"
          });
        }

        end.setHours(23, 59, 59, 999);

        matchStage.createdAt.$lte = end;
      }
    }

    const parsedLimit = Math.min(
      Math.max(parseInt(limit) || 10, 1),
      100
    );

    const supplierPerformance =
      await StockMovements.aggregate([
        {
          $match: matchStage
        },

        // Get supplier
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier",
            foreignField: "_id",
            as: "supplierData"
          }
        },

        {
          $unwind: {
            path: "$supplierData",
            preserveNullAndEmptyArrays: false
          }
        },

        // Calculate purchase value
        {
          $group: {
            _id: "$supplier",

            supplierName: {
              $first: "$supplierData.name"
            },

            supplierEmail: {
              $first: "$supplierData.email"
            },

            supplierPhone: {
              $first: "$supplierData.phone"
            },

            totalPurchases: {
              $sum: 1
            },

            totalQuantityPurchased: {
              $sum: "$quantity"
            },

            totalPurchaseValue: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$unitPrice"
                ]
              }
            },

            lastPurchaseDate: {
              $max: "$createdAt"
            },

            firstPurchaseDate: {
              $min: "$createdAt"
            }
          }
        },

        {
          $sort: {
            totalPurchaseValue: -1
          }
        }
      ]);

    const limitedSuppliers =
      supplierPerformance.slice(
        0,
        parsedLimit
      );

    const totalSuppliers =
      supplierPerformance.length;

    const totalPurchaseValue =
      supplierPerformance.reduce(
        (sum, supplier) =>
          sum + supplier.totalPurchaseValue,
        0
      );

    const totalQuantityPurchased =
      supplierPerformance.reduce(
        (sum, supplier) =>
          sum + supplier.totalQuantityPurchased,
        0
      );

    const totalPurchaseTransactions =
      supplierPerformance.reduce(
        (sum, supplier) =>
          sum + supplier.totalPurchases,
        0
      );

    const suppliers = limitedSuppliers.map(
      (supplier) => ({
        supplierId: supplier._id,

        supplierName:
          supplier.supplierName,

        supplierEmail:
          supplier.supplierEmail || null,

        supplierPhone:
          supplier.supplierPhone || null,

        totalPurchases:
          supplier.totalPurchases,

        totalQuantityPurchased:
          supplier.totalQuantityPurchased,

        totalPurchaseValue: Number(
          supplier.totalPurchaseValue.toFixed(2)
        ),

        averagePurchaseValue: Number(
          (
            supplier.totalPurchaseValue /
            supplier.totalPurchases
          ).toFixed(2)
        ),

        lastPurchaseDate:
          supplier.lastPurchaseDate,

        firstPurchaseDate:
          supplier.firstPurchaseDate
      })
    );

    return res.status(200).json({
      success: true,

      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        limit: parsedLimit
      },

      summary: {
        totalSuppliers,
        totalPurchaseTransactions,
        totalQuantityPurchased,

        totalPurchaseValue: Number(
          totalPurchaseValue.toFixed(2)
        )
      },

      suppliers
    });

  } catch (error) {
    console.error(
      "Error getting supplier performance:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get supplier performance analytics",
      error: error.message
    });
  }
};
//<--------CUSTOMER ANALYTICS---------->
const getCustomerAnalytics = async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();

    const result = await StockMovements.aggregate([
      {
        $match: {
          type: "SALE"
        }
      },
      {
        $group: {
          _id: null,

          totalSales: {
            $sum: 1
          },

          totalQuantitySold: {
            $sum: "$quantity"
          },

          totalRevenue: {
            $sum: {
              $multiply: ["$quantity", "$unitPrice"]
            }
          }
        }
      }
    ]);

    const analytics = result[0] || {
      totalSales: 0,
      totalQuantitySold: 0,
      totalRevenue: 0
    };

    const averageSaleValue =
      analytics.totalSales > 0
        ? analytics.totalRevenue / analytics.totalSales
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalSales: analytics.totalSales,
        totalQuantitySold: analytics.totalQuantitySold,
        totalRevenue: analytics.totalRevenue,
        averageSaleValue
      }
    });

  } catch (error) {
    console.error("Error fetching customer analytics:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching customer analytics"
    });
  }
};
//<-----------TOP CUSTOMERS------------->
const getTopCustomers = async (req, res) => {
  try {
    const rawLimit = req.query.limit;
    const limit = rawLimit !== undefined ? Number(rawLimit) : 5;

    if (!Number.isInteger(limit) || limit <= 0) {
      return res.status(400).json({
        success: false,
        message: "Limit must be a positive integer",
      });
    }

    const finalLimit = Math.min(limit, 100);

    const topCustomers = await StockMovements.aggregate([
      // Only sales
      {
        $match: {
          type: "SALE",
          customer: { $ne: null },
        },
      },

      // Group sales by customer
      {
        $group: {
          _id: "$customer",

          totalSpent: {
            $sum: {
              $multiply: ["$quantity", "$unitPrice"],
            },
          },

          totalQuantityPurchased: {
            $sum: "$quantity",
          },

          salesCount: {
            $sum: 1,
          },
        },
      },

      // Highest spending customers first
      {
        $sort: {
          totalSpent: -1,
        },
      },

      // Limit results
      {
        $limit: finalLimit,
      },

      // Get customer details
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer",
        },
      },

      // Convert customer array into object
      {
        $unwind: "$customer",
      },

      // Select response fields
      {
        $project: {
          _id: 0,

          customerId: "$_id",

          name: "$customer.name",

          phone: "$customer.phone",

          email: "$customer.email",

          totalSpent: 1,

          totalQuantityPurchased: 1,

          salesCount: 1,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: topCustomers.length,
      data: topCustomers,
    });

  } catch (error) {
    console.error("Error fetching top customers:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching top customers",
    });
  }
};
//<-----------CUSTOMER PURCHASE HISTORY------------->
const getCustomerPurchaseHistory = async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate
    } = req.query;

    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID"
      });
    }

    // Validate page
    const pageNumber = Number(page);

    if (!Number.isInteger(pageNumber) || pageNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer"
      });
    }

    // Validate limit
    const limitNumber = Number(limit);

    if (!Number.isInteger(limitNumber) || limitNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "Limit must be a positive integer"
      });
    }

    const finalLimit = Math.min(limitNumber, 100);
    const skip = (pageNumber - 1) * finalLimit;

    // Check customer exists
    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    // Build match condition
    const match = {
      type: "SALE",
      customer: new mongoose.Types.ObjectId(customerId)
    };

    // Date filtering
    if (startDate || endDate) {
      match.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate"
          });
        }

        match.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate"
          });
        }

        // Include the entire end date
        end.setHours(23, 59, 59, 999);

        match.createdAt.$lte = end;
      }
    }

    // Get total number of sales
    const totalSales = await StockMovements.countDocuments(match);

    // Get purchase history
    const purchases = await StockMovements.aggregate([
      {
        $match: match
      },

      // Get product information
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product"
        }
      },

      {
        $unwind: "$product"
      },

      // Newest sales first
      {
        $sort: {
          createdAt: -1
        }
      },

      // Pagination
      {
        $skip: skip
      },

      {
        $limit: finalLimit
      },

      // Response fields
      {
        $project: {
          _id: 1,

          product: {
            _id: "$product._id",
            name: "$product.name"
          },

          quantity: 1,

          unitPrice: 1,

          totalAmount: {
            $multiply: [
              "$quantity",
              "$unitPrice"
            ]
          },

          createdAt: 1
        }
      }
    ]);

    const totalPages = Math.ceil(totalSales / finalLimit);

    return res.status(200).json({
      success: true,

      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      },

      pagination: {
        currentPage: pageNumber,
        limit: finalLimit,
        totalSales,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      },

      data: purchases
    });

  } catch (error) {
    console.error(
      "Error fetching customer purchase history:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server error while fetching customer purchase history"
    });
  }
};
//<------------CUSTOMER SPENDING OVER TIME------------->
const getCustomerSpendingOverTime = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
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

    // Build match condition
    const match = {
      type: "SALE",
      customer: new mongoose.Types.ObjectId(customerId),
    };

    // Date filtering
    if (startDate || endDate) {
      match.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate",
          });
        }

        match.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate",
          });
        }

        // Include entire end date
        end.setHours(23, 59, 59, 999);

        match.createdAt.$lte = end;
      }
    }

    const spending = await StockMovements.aggregate([
      {
        $match: match,
      },

      // Group by date
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },

          totalSpent: {
            $sum: {
              $multiply: ["$quantity", "$unitPrice"],
            },
          },

          quantityPurchased: {
            $sum: "$quantity",
          },

          salesCount: {
            $sum: 1,
          },
        },
      },

      // Oldest date first
      {
        $sort: {
          _id: 1,
        },
      },

      // Rename fields
      {
        $project: {
          _id: 0,
          date: "$_id",
          totalSpent: 1,
          quantityPurchased: 1,
          salesCount: 1,
        },
      },
    ]);

    return res.status(200).json({
      success: true,

      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },

      data: spending,
    });

  } catch (error) {
    console.error(
      "Error fetching customer spending over time:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server error while fetching customer spending over time",
    });
  }
};
//<-----------SALES GROWTH------------->
const getSalesGrowth = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const match = {
      type: "SALE",
    };

    if (startDate || endDate) {
      match.createdAt = {};

      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const currentSales = await StockMovements.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSales: {
            $sum: {
              $multiply: ["$quantity", "$unitPrice"],
            },
          },
          totalQuantity: {
            $sum: "$quantity",
          },
        },
      },
    ]);

    const currentTotalSales = currentSales[0]?.totalSales || 0;
    const currentTotalQuantity = currentSales[0]?.totalQuantity || 0;

    let previousTotalSales = 0;
    let previousTotalQuantity = 0;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      const periodLength = end.getTime() - start.getTime();

      const previousEnd = new Date(start.getTime() - 1);
      const previousStart = new Date(
        previousEnd.getTime() - periodLength
      );

      const previousSales = await StockMovements.aggregate([
        {
          $match: {
            type: "SALE",
            createdAt: {
              $gte: previousStart,
              $lte: previousEnd,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: {
              $sum: {
                $multiply: ["$quantity", "$unitPrice"],
              },
            },
            totalQuantity: {
              $sum: "$quantity",
            },
          },
        },
      ]);

      previousTotalSales = previousSales[0]?.totalSales || 0;
      previousTotalQuantity = previousSales[0]?.totalQuantity || 0;
    }

    const salesGrowth =
      previousTotalSales === 0
        ? currentTotalSales > 0
          ? 100
          : 0
        : ((currentTotalSales - previousTotalSales) /
            previousTotalSales) *
          100;

    const quantityGrowth =
      previousTotalQuantity === 0
        ? currentTotalQuantity > 0
          ? 100
          : 0
        : ((currentTotalQuantity - previousTotalQuantity) /
            previousTotalQuantity) *
          100;

    res.status(200).json({
      success: true,
      data: {
        currentPeriod: {
          totalSales: currentTotalSales,
          totalQuantity: currentTotalQuantity,
        },
        previousPeriod: {
          totalSales: previousTotalSales,
          totalQuantity: previousTotalQuantity,
        },
        growth: {
          salesGrowth: Number(salesGrowth.toFixed(2)),
          quantityGrowth: Number(quantityGrowth.toFixed(2)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//<-----------SALES TREND------------->
const getSalesTrend = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const match = {
      type: "SALE",
    };

    if (startDate || endDate) {
      match.createdAt = {};

      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const sales = await StockMovements.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          totalSales: {
            $sum: {
              $multiply: ["$quantity", "$unitPrice"],
            },
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    if (sales.length < 2) {
      return res.status(200).json({
        success: true,
        data: {
          trend: "STABLE",
          sales: sales.map((item) => ({
            date: item._id,
            totalSales: item.totalSales,
          })),
        },
      });
    }

    const firstSales = sales[0].totalSales;
    const lastSales = sales[sales.length - 1].totalSales;

    const difference = lastSales - firstSales;

    const threshold = firstSales * 0.05;

    let trend;

    if (difference > threshold) {
      trend = "INCREASING";
    } else if (difference < -threshold) {
      trend = "DECREASING";
    } else {
      trend = "STABLE";
    }

    res.status(200).json({
      success: true,
      data: {
        trend,
        firstDaySales: firstSales,
        lastDaySales: lastSales,
        change: Number(difference.toFixed(2)),
        sales: sales.map((item) => ({
          date: item._id,
          totalSales: item.totalSales,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//<-----------INVENTORY VALUATION------------->
const getInventoryValuation = async (req, res) => {
  try {
    const result = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          inventoryValue: {
            $sum: {
              $multiply: ["$quantity", "$purchasePrice"],
            },
          },
        },
      },
    ]);

    const data = result[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      inventoryValue: 0,
    };

    res.status(200).json({
      success: true,
      data: {
        totalProducts: data.totalProducts,
        totalQuantity: data.totalQuantity,
        inventoryValue: Number(data.inventoryValue.toFixed(2)),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//<-----------INVENTORY VALUATION BY CATEGORY------------->
const getInventoryValuationByCategory = async (req, res) => {
  try {
    const result = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalQuantity: {
            $sum: "$quantity",
          },
          inventoryValue: {
            $sum: {
              $multiply: ["$quantity", "$purchasePrice"],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          totalQuantity: 1,
          inventoryValue: {
            $round: ["$inventoryValue", 2],
          },
        },
      },
      {
        $sort: {
          inventoryValue: -1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//<-----------ABC INVENTORY ANALYSIS------------->
//Based on inventory value not quantity
const getABCInventoryAnalysis = async (req, res) => {
  try {
    const products = await Product.aggregate([
      {
        $project: {
          name: 1,
          category: 1,
          quantity: 1,
          purchasePrice: 1,
          inventoryValue: {
            $multiply: ["$quantity", "$purchasePrice"],
          },
        },
      },
      {
        $sort: {
          inventoryValue: -1,
        },
      },
    ]);

    const totalInventoryValue = products.reduce(
      (total, product) => total + product.inventoryValue,
      0
    );

    let cumulativeValue = 0;

    const analyzedProducts = products.map((product) => {
      cumulativeValue += product.inventoryValue;

      const cumulativePercentage =
        totalInventoryValue === 0
          ? 0
          : (cumulativeValue / totalInventoryValue) * 100;

      let classification;

      if (cumulativePercentage <= 70) {
        classification = "A";
      } else if (cumulativePercentage <= 90) {
        classification = "B";
      } else {
        classification = "C";
      }

      return {
        productId: product._id,
        name: product.name,
        category: product.category,
        quantity: product.quantity,
        purchasePrice: product.purchasePrice,
        inventoryValue: Number(product.inventoryValue.toFixed(2)),
        cumulativePercentage: Number(
          cumulativePercentage.toFixed(2)
        ),
        classification,
      };
    });

    const summary = {
      A: analyzedProducts.filter(
        (product) => product.classification === "A"
      ).length,

      B: analyzedProducts.filter(
        (product) => product.classification === "B"
      ).length,

      C: analyzedProducts.filter(
        (product) => product.classification === "C"
      ).length,
    };

    res.status(200).json({
      success: true,
      data: {
        totalInventoryValue: Number(
          totalInventoryValue.toFixed(2)
        ),
        summary,
        products: analyzedProducts,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//<--------STOCK RECOMMENDATION METRICS-------->
const getStockRecommendationMetrics = async (req, res) => {
  try {
    const now = new Date();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);


    const result = await Product.aggregate([
      {
        $lookup: {
          from: "stockmovements",

          let: {
            productId: "$_id"
          },

          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$product",
                        "$$productId"
                      ]
                    },
                    {
                      $eq: [
                        "$type",
                        "SALE"
                      ]
                    }
                  ]
                }
              }
            },

            {
              $group: {
                _id: null,

                salesLast7Days: {
                  $sum: {
                    $cond: [
                      {
                        $gte: [
                          "$createdAt",
                          sevenDaysAgo
                        ]
                      },
                      "$quantity",
                      0
                    ]
                  }
                },

                salesLast30Days: {
                  $sum: {
                    $cond: [
                      {
                        $gte: [
                          "$createdAt",
                          thirtyDaysAgo
                        ]
                      },
                      "$quantity",
                      0
                    ]
                  }
                },

                salesPrevious30Days: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $gte: [
                              "$createdAt",
                              sixtyDaysAgo
                            ]
                          },
                          {
                            $lt: [
                              "$createdAt",
                              thirtyDaysAgo
                            ]
                          }
                        ]
                      },
                      "$quantity",
                      0
                    ]
                  }
                }
              }
            }
          ],

          as: "salesData"
        }
      },


      {
        $project: {
          name: 1,
          category: 1,
          quantity: 1,
          lowStockThreshold: 1,
          purchasePrice: 1,

          salesLast7Days: {
            $ifNull: [
              {
                $arrayElemAt: [
                  "$salesData.salesLast7Days",
                  0
                ]
              },
              0
            ]
          },

          salesLast30Days: {
            $ifNull: [
              {
                $arrayElemAt: [
                  "$salesData.salesLast30Days",
                  0
                ]
              },
              0
            ]
          },

          salesPrevious30Days: {
            $ifNull: [
              {
                $arrayElemAt: [
                  "$salesData.salesPrevious30Days",
                  0
                ]
              },
              0
            ]
          }
        }
      }
    ]);


    /*
     * Calculate deterministic inventory metrics.
     */
    const metrics = result.map((product) => {
      const averageDailySales =
        product.salesLast30Days / 30;


      const salesGrowth =
        product.salesPrevious30Days === 0
          ? product.salesLast30Days > 0
            ? 100
            : 0
          : (
              (
                product.salesLast30Days -
                product.salesPrevious30Days
              ) /
              product.salesPrevious30Days
            ) * 100;


      const daysOfStockRemaining =
        averageDailySales > 0
          ? product.quantity / averageDailySales
          : null;


      return {
        productId: product._id,

        name: product.name,

        category: product.category,

        currentStock: product.quantity,

        lowStockThreshold:
          product.lowStockThreshold,

        purchasePrice:
          product.purchasePrice,

        salesLast7Days:
          product.salesLast7Days,

        salesLast30Days:
          product.salesLast30Days,

        salesPrevious30Days:
          product.salesPrevious30Days,

        averageDailySales: Number(
          averageDailySales.toFixed(2)
        ),

        salesGrowth: Number(
          salesGrowth.toFixed(2)
        ),

        daysOfStockRemaining:
          daysOfStockRemaining === null
            ? null
            : Number(
                daysOfStockRemaining.toFixed(2)
              )
      };
    });


    /*
     * Calculate the backend-controlled base
     * reorder quantity.
     */
    const metricsWithReorderQuantity =
      metrics.map((product) => {
        const baseReorderQuantity =
          calculateBaseReorderQuantity(product);

        return {
          ...product,
          baseReorderQuantity
        };
      });


    /*
     * Try Gemini.
     *
     * Gemini is used for interpretation/reasoning.
     * Backend calculations remain authoritative.
     */
    let aiRecommendations = null;

    try {
      aiRecommendations =
        await generateStockRecommendations(
          metricsWithReorderQuantity
        );
    }

    catch (aiError) {
      console.warn(
        "AI recommendation failed, falling back to rule-based logic:",
        aiError.message
      );
    }


    /*
     * Rule-based fallback if Gemini is unavailable.
     */
    const fallbackRecommendations =
      metricsWithReorderQuantity.map((product) => ({
        productId:
          product.productId.toString(),

        recommendation:
          product.salesLast30Days === 0
            ? "NO_SALES"

            : product.currentStock <=
              product.lowStockThreshold
              ? "REORDER_NOW"

            : product.daysOfStockRemaining !== null &&
              product.daysOfStockRemaining <= 7
              ? "REORDER_SOON"

            : "HEALTHY",

        reason:
          "Recommendation generated using backend inventory and demand rules."
      }));


    /*
     * Use AI output when available.
     * Otherwise use deterministic fallback.
     */
    const rawRecommendations =
      aiRecommendations &&
      Array.isArray(
        aiRecommendations.recommendations
      )
        ? aiRecommendations.recommendations
        : fallbackRecommendations;


    /*
     * Validate AI output against backend metrics.
     */
    const validatedRecommendations =
      validateRecommendations(
        metricsWithReorderQuantity,
        rawRecommendations
      );


    /*
     * Create recommendation lookup.
     */
    const recommendationMap =
      new Map(
        validatedRecommendations.map(
          (recommendation) => [
            recommendation.productId.toString(),
            recommendation
          ]
        )
      );


    /*
     * Merge metrics + recommendation.
     */
    const data =
      metricsWithReorderQuantity.map(
        (product) => {
          const recommendation =
            recommendationMap.get(
              product.productId.toString()
            );

          return {
            ...product,

            recommendation:
              recommendation?.recommendation ||
              null,

            recommendedQuantity:
              recommendation?.recommendedQuantity ??
              null,

            reason:
              recommendation?.reason ||
              null
          };
        }
      );


    res.status(200).json({
      success: true,
      data
    });

  }

  catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
//--------------------------------------------------------------------------




//<----------------GET DASHBOARD SUMMARY---------------?
const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);


    const [
      inventoryStats,
      salesStats,
      purchaseStats,
      customerStats,
      lowStockProducts,
      topSellingProducts,
      salesTrend,
      purchaseTrend,
      financialStats
    ] = await Promise.all([

      /*
       * Inventory statistics
       */
      Product.aggregate([
        {
          $group: {
            _id: null,

            totalProducts: {
              $sum: 1
            },

            totalStock: {
              $sum: "$quantity"
            },

            inventoryValue: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$purchasePrice"
                ]
              }
            },

            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $lte: [
                      "$quantity",
                      "$lowStockThreshold"
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            outOfStockCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$quantity",
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),


      /*
       * Sales statistics
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "SALE",

            createdAt: {
              $gte: sixtyDaysAgo
            }
          }
        },

        {
          $group: {
            _id: null,

            currentUnitsSold: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  "$quantity",
                  0
                ]
              }
            },

            previousUnitsSold: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  "$quantity",
                  0
                ]
              }
            },

            currentSales: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },
                  0
                ]
              }
            },

            previousSales: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },
                  0
                ]
              }
            },

            currentSalesCount: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            previousSalesCount: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),


      /*
       * Purchase statistics
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "PURCHASE",

            createdAt: {
              $gte: sixtyDaysAgo
            }
          }
        },

        {
          $group: {
            _id: null,

            currentUnitsPurchased: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  "$quantity",
                  0
                ]
              }
            },

            previousUnitsPurchased: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  "$quantity",
                  0
                ]
              }
            },

            currentPurchases: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },
                  0
                ]
              }
            },

            previousPurchases: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },
                  0
                ]
              }
            },

            currentPurchaseCount: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            previousPurchaseCount: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),


      /*
       * Customer statistics
       */
      Customer.aggregate([
        {
          $group: {
            _id: null,

            totalCustomers: {
              $sum: 1
            }
          }
        }
      ]),


      /*
       * Low-stock products
       */
      Product.find({
        $expr: {
          $lte: [
            "$quantity",
            "$lowStockThreshold"
          ]
        }
      })
        .select(
          "name category quantity lowStockThreshold"
        )
        .sort({
          quantity: 1
        })
        .limit(5),


      /*
       * Top-selling products
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "SALE",

            createdAt: {
              $gte: thirtyDaysAgo
            }
          }
        },

        {
          $group: {
            _id: "$product",

            quantitySold: {
              $sum: "$quantity"
            },

            revenue: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$unitPrice"
                ]
              }
            }
          }
        },

        {
          $sort: {
            quantitySold: -1
          }
        },

        {
          $limit: 5
        },

        {
          $lookup: {
            from: "products",

            localField: "_id",

            foreignField: "_id",

            as: "product"
          }
        },

        {
          $unwind: "$product"
        },

        {
          $project: {
            _id: 0,

            productId: "$product._id",

            name: "$product.name",

            category: "$product.category",

            quantitySold: 1,

            revenue: 1
          }
        }
      ]),


      /*
       * Sales trend
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "SALE",

            createdAt: {
              $gte: thirtyDaysAgo
            }
          }
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },

            unitsSold: {
              $sum: "$quantity"
            },

            revenue: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$unitPrice"
                ]
              }
            },

            salesCount: {
              $sum: 1
            }
          }
        },

        {
          $sort: {
            _id: 1
          }
        },

        {
          $project: {
            _id: 0,

            date: "$_id",

            unitsSold: 1,

            revenue: {
              $round: [
                "$revenue",
                2
              ]
            },

            salesCount: 1
          }
        }
      ]),


      /*
       * Purchase trend
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "PURCHASE",

            createdAt: {
              $gte: thirtyDaysAgo
            }
          }
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },

            unitsPurchased: {
              $sum: "$quantity"
            },

            spending: {
              $sum: {
                $multiply: [
                  "$quantity",
                  "$unitPrice"
                ]
              }
            },

            purchaseCount: {
              $sum: 1
            }
          }
        },

        {
          $sort: {
            _id: 1
          }
        },

        {
          $project: {
            _id: 0,

            date: "$_id",

            unitsPurchased: 1,

            spending: {
              $round: [
                "$spending",
                2
              ]
            },

            purchaseCount: 1
          }
        }
      ]),


      /*
       * Financial statistics
       *
       * Revenue:
       * quantity × selling unitPrice
       *
       * Cost:
       * quantity × product.purchasePrice
       */
      StockMovements.aggregate([
        {
          $match: {
            type: "SALE",

            createdAt: {
              $gte: sixtyDaysAgo
            }
          }
        },

        {
          $lookup: {
            from: "products",

            localField: "product",

            foreignField: "_id",

            as: "product"
          }
        },

        {
          $unwind: "$product"
        },

        {
          $group: {
            _id: null,

            currentRevenue: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },

                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },

                  0
                ]
              }
            },

            previousRevenue: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },

                  {
                    $multiply: [
                      "$quantity",
                      "$unitPrice"
                    ]
                  },

                  0
                ]
              }
            },

            currentCost: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },

                  {
                    $multiply: [
                      "$quantity",
                      "$product.purchasePrice"
                    ]
                  },

                  0
                ]
              }
            },

            previousCost: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$createdAt",
                      thirtyDaysAgo
                    ]
                  },

                  {
                    $multiply: [
                      "$quantity",
                      "$product.purchasePrice"
                    ]
                  },

                  0
                ]
              }
            }
          }
        }
      ])
    ]);


    /*
     * Default values
     */
    const inventory = inventoryStats[0] || {
      totalProducts: 0,
      totalStock: 0,
      inventoryValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };


    const sales = salesStats[0] || {
      currentUnitsSold: 0,
      previousUnitsSold: 0,
      currentSales: 0,
      previousSales: 0,
      currentSalesCount: 0,
      previousSalesCount: 0
    };


    const purchases = purchaseStats[0] || {
      currentUnitsPurchased: 0,
      previousUnitsPurchased: 0,
      currentPurchases: 0,
      previousPurchases: 0,
      currentPurchaseCount: 0,
      previousPurchaseCount: 0
    };


    const customers = customerStats[0] || {
      totalCustomers: 0
    };


    const financial = financialStats[0] || {
      currentRevenue: 0,
      previousRevenue: 0,
      currentCost: 0,
      previousCost: 0
    };


    /*
     * Growth calculations
     */
    const salesGrowth =
      sales.previousSales === 0
        ? sales.currentSales > 0
          ? 100
          : 0
        : (
            (
              sales.currentSales -
              sales.previousSales
            ) /
            sales.previousSales
          ) * 100;


    const purchaseGrowth =
      purchases.previousPurchases === 0
        ? purchases.currentPurchases > 0
          ? 100
          : 0
        : (
            (
              purchases.currentPurchases -
              purchases.previousPurchases
            ) /
            purchases.previousPurchases
          ) * 100;


    /*
     * Financial calculations
     */
    const currentProfit =
      financial.currentRevenue -
      financial.currentCost;


    const previousProfit =
      financial.previousRevenue -
      financial.previousCost;


    const profitGrowth =
      previousProfit === 0
        ? currentProfit > 0
          ? 100
          : 0
        : (
            (
              currentProfit -
              previousProfit
            ) /
            Math.abs(previousProfit)
          ) * 100;


    const profitMargin =
      financial.currentRevenue === 0
        ? 0
        : (
            currentProfit /
            financial.currentRevenue
          ) * 100;


    /*
     * Sales vs purchases
     */
    const salesVsPurchasesDifference =
      sales.currentSales -
      purchases.currentPurchases;


    const salesToPurchaseRatio =
      purchases.currentPurchases === 0
        ? sales.currentSales > 0
          ? null
          : 0
        : sales.currentSales /
          purchases.currentPurchases;


    /*
     * Final response
     */
    const data = {

      overview: {
        totalProducts:
          inventory.totalProducts,

        totalCustomers:
          customers.totalCustomers,

        totalStock:
          inventory.totalStock,

        inventoryValue:
          Number(
            inventory.inventoryValue.toFixed(2)
          ),

        lowStockCount:
          inventory.lowStockCount,

        outOfStockCount:
          inventory.outOfStockCount
      },


      sales: {
        period: "LAST_30_DAYS",

        totalUnitsSold:
          sales.currentUnitsSold,

        totalSales:
          Number(
            sales.currentSales.toFixed(2)
          ),

        salesCount:
          sales.currentSalesCount,

        previousPeriod: {
          totalUnitsSold:
            sales.previousUnitsSold,

          totalSales:
            Number(
              sales.previousSales.toFixed(2)
            ),

          salesCount:
            sales.previousSalesCount
        },

        growth: Number(
          salesGrowth.toFixed(2)
        )
      },


      purchases: {
        period: "LAST_30_DAYS",

        totalUnitsPurchased:
          purchases.currentUnitsPurchased,

        totalPurchases:
          Number(
            purchases.currentPurchases.toFixed(2)
          ),

        purchaseCount:
          purchases.currentPurchaseCount,

        previousPeriod: {
          totalUnitsPurchased:
            purchases.previousUnitsPurchased,

          totalPurchases:
            Number(
              purchases.previousPurchases.toFixed(2)
            ),

          purchaseCount:
            purchases.previousPurchaseCount
        },

        growth: Number(
          purchaseGrowth.toFixed(2)
        )
      },


      /*
       * Financial summary
       */
      financial: {
        period: "LAST_30_DAYS",

        revenue: Number(
          financial.currentRevenue.toFixed(2)
        ),

        costOfGoodsSold: Number(
          financial.currentCost.toFixed(2)
        ),

        profit: Number(
          currentProfit.toFixed(2)
        ),

        profitMargin: Number(
          profitMargin.toFixed(2)
        ),

        growth: Number(
          profitGrowth.toFixed(2)
        ),

        previousPeriod: {
          revenue: Number(
            financial.previousRevenue.toFixed(2)
          ),

          costOfGoodsSold: Number(
            financial.previousCost.toFixed(2)
          ),

          profit: Number(
            previousProfit.toFixed(2)
          )
        }
      },


      /*
       * Sales vs purchases
       */
      salesVsPurchases: {
        sales: Number(
          sales.currentSales.toFixed(2)
        ),

        purchases: Number(
          purchases.currentPurchases.toFixed(2)
        ),

        difference: Number(
          salesVsPurchasesDifference.toFixed(2)
        ),

        salesToPurchaseRatio:
          salesToPurchaseRatio === null
            ? null
            : Number(
                salesToPurchaseRatio.toFixed(2)
              )
      },


      /*
       * Inventory health
       */
      inventoryHealth: {
        lowStockCount:
          inventory.lowStockCount,

        outOfStockCount:
          inventory.outOfStockCount,

        healthyStockCount:
          Math.max(
            0,
            inventory.totalProducts -
            inventory.lowStockCount
          )
      },


      /*
       * Trends
       */
      trends: {
        sales: salesTrend,

        purchases: purchaseTrend
      },


      /*
       * Low-stock alerts
       */
      lowStockProducts,


      /*
       * Top-selling products
       */
      topSellingProducts
    };


    res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
//<--------GET SINGLE PRODUCT STOCK RECOMMENDATION-------->
const getSingleProductRecommendation = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const now = new Date();
    const sevenDaysAgo  = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const sixtyDaysAgo  = new Date(now); sixtyDaysAgo.setDate(now.getDate() - 60);

    /*
     * Pull sales data for this specific product.
     */
    const salesAgg = await StockMovements.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
          type:    "SALE"
        }
      },
      {
        $group: {
          _id: null,

          salesLast7Days: {
            $sum: {
              $cond: [ { $gte: ["$createdAt", sevenDaysAgo] },  "$quantity", 0 ]
            }
          },

          salesLast30Days: {
            $sum: {
              $cond: [ { $gte: ["$createdAt", thirtyDaysAgo] }, "$quantity", 0 ]
            }
          },

          salesPrevious30Days: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$createdAt", sixtyDaysAgo]  },
                    { $lt:  ["$createdAt", thirtyDaysAgo] }
                  ]
                },
                "$quantity",
                0
              ]
            }
          }
        }
      }
    ]);

    const salesData = salesAgg[0] || {
      salesLast7Days:      0,
      salesLast30Days:     0,
      salesPrevious30Days: 0
    };

    /*
     * Deterministic metric calculations.
     */
    const averageDailySales = salesData.salesLast30Days / 30;

    const salesGrowth =
      salesData.salesPrevious30Days === 0
        ? salesData.salesLast30Days > 0 ? 100 : 0
        : ((salesData.salesLast30Days - salesData.salesPrevious30Days) /
            salesData.salesPrevious30Days) * 100;

    const daysOfStockRemaining =
      averageDailySales > 0
        ? product.quantity / averageDailySales
        : null;

    const baseReorderQuantity =
      calculateBaseReorderQuantity({
        salesLast30Days:  salesData.salesLast30Days,
        averageDailySales,
        currentStock:     product.quantity
      });

    const metrics = {
      productId:           product._id,
      name:                product.name,
      category:            product.category,
      currentStock:        product.quantity,
      lowStockThreshold:   product.lowStockThreshold,
      purchasePrice:       product.purchasePrice,
      salesLast7Days:      salesData.salesLast7Days,
      salesLast30Days:     salesData.salesLast30Days,
      salesPrevious30Days: salesData.salesPrevious30Days,
      averageDailySales:   Number(averageDailySales.toFixed(2)),
      salesGrowth:         Number(salesGrowth.toFixed(2)),
      daysOfStockRemaining:
        daysOfStockRemaining === null
          ? null
          : Number(daysOfStockRemaining.toFixed(2)),
      baseReorderQuantity
    };

    /*
     * Deterministic recommendation (source of truth).
     */
    let deterministicRecommendation;

    if (metrics.salesLast30Days === 0) {
      deterministicRecommendation = "NO_SALES";
    } else if (metrics.currentStock <= metrics.lowStockThreshold) {
      deterministicRecommendation = "REORDER_NOW";
    } else if (
      metrics.daysOfStockRemaining !== null &&
      metrics.daysOfStockRemaining <= 7
    ) {
      deterministicRecommendation = "REORDER_SOON";
    } else {
      deterministicRecommendation = "HEALTHY";
    }

    const recommendedQuantity =
      calculateRecommendedQuantity(metrics, deterministicRecommendation);

    /*
     * Try Gemini for a human-readable explanation.
     */
    let aiReason = null;

    try {
      const aiResult = await generateStockRecommendations([metrics]);
      if (
        aiResult &&
        Array.isArray(aiResult.recommendations) &&
        aiResult.recommendations.length > 0
      ) {
        aiReason = aiResult.recommendations[0].reason || null;
      }
    } catch (aiError) {
      console.warn(
        "AI single-product recommendation failed, using fallback:",
        aiError.message
      );
    }

    const reason =
      aiReason ||
      "Recommendation generated using backend inventory and demand rules.";

    return res.status(200).json({
      success: true,
      data: {
        ...metrics,
        recommendation:     deterministicRecommendation,
        recommendedQuantity,
        reason
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
//--------------------------------------------------------------------------

module.exports = {
    getSalesAnalytics,
    getPurchaseAnalytics,
    getSalesOverTime,
    getPurchaseOverTime,
    getTopSellingProducts,
    getProductAnalytics,
    getSalesVsPurchases,
    getSalesByCategory,
    getPurchasesByCategory,
    getInventoryByCategory,
    getInventoryHealth,
    getProfitLoss,getProfitLossOverTime,
    getProfitLossByProduct,
    getInventoryAlerts,
    getInventoryTurnover,
    getDeadStock,
    getProductMovement,
    getSupplierPerformance,
    getCustomerAnalytics,getTopCustomers,getCustomerPurchaseHistory,
    getCustomerSpendingOverTime,
    getSalesGrowth,getSalesTrend,
    getInventoryValuation,getInventoryValuationByCategory,
    getABCInventoryAnalysis,getStockRecommendationMetrics,getDashboardSummary,
    getSingleProductRecommendation
};
