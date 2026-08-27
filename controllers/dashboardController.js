const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");

const getDashboardStats = async(req, res) => {
    try {
        // dashboard logic

        res.status(200).json({
            message: "Dashboard stats"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard stats"
        });
    }
};

module.exports = { getDashboardStats };