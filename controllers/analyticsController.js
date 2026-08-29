const mongoose = require("mongoose");
const StockMovements = require("../models/StockMovements");

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
        // Schema is flat: each StockMovement doc has a single product, quantity, unitPrice
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

module.exports = {
    getSalesAnalytics,
    getPurchaseAnalytics,
    getSalesOverTime,
    getPurchaseOverTime,
    getTopSellingProducts
};