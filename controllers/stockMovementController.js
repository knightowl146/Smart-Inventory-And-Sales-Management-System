const StockMovement = require("../models/StockMovements")

const getMovements = async (req,res)=>{
    try{
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const skip = (page-1) * limit;

        const movements = await StockMovement.find()
            .populate("product", "name")
            .sort({ createdAt: -1})
            .skip(skip)
            .limit(limit);
        const totalMovements = await StockMovement.countDocuments();

        return res.status(200).json({
            success: true,
            data: movements,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalMovements / limit),
                totalMovements
            }
        });

        
    }
    catch(err){
        console.log(err);
        return res.status(500).json({
            success:false,
            message:"Internal server error"
        });
    }
};

module.exports = {getMovements};