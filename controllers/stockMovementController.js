const StockMovement = require("../models/StockMovements")

//----------All product movements----------//
const getMovements = async(req,res)=>{
  try{
    const {type} = req.query;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    
    //Pagination Validation
    if(!Number.isInteger(page) || page <1){
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer"
      })
    }
    if(!Number.isInteger(limit) || limit<1 || limit >100){
      return res.status(400).json({
        success: false,
        message: "Limit must be an integer between 1 and 100"
      })
    }

    //Type Validation

    if(type && !["PURCHASE","SALE"].includes(type)){
      return res.status(400).json({
        success: false,
        message: "Type must be either PURCHASE or SALE"
      });
    }
    const filter = {};

    if(type){
        filter.type = type;
    }
    const skip = (page-1)*limit;
    const totalMovements = await StockMovement.countDocuments(filter);
    const movements = await StockMovement.find(filter)
    .populate("product","name")
    .sort({createdAt:-1})
    .skip(skip)
    .limit(limit);

    return res.status(200).json({
      success: true,
      data: movements,
      pagination:{
        currentPage: page,
        totalPages: Math.ceil(totalMovements/limit),
        totalMovements: totalMovements,
        limit
      }
    });
  }
  catch(error){
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

//<-------- Product Movements---------->
const productMovements = async(req,res)=>{

  try{
    
    const {id} = req.params;
    const {type} = req.query;

    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({
        success: false,
        message: "Invalid id"
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
          success: false,
          message: "Page must be a positive integer"
      });
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be an integer between 1 and 100"
      });
    }

    if(type && !["PURCHASE","SALE"].includes(type)){
      return res.status(400).json({
        success:false,
        message:"Type must be either PURCHASE or SALE"
      });
    }

    const filter = {
      product: id
    };
    if(type){
      filter.type = type;
    }


    const skip = (page-1)*limit;
    const totalMovements = await StockMovement.countDocuments(filter);

    const movements = await StockMovement.find({
      product:id
    })
    .populate("product","name")
    .sort({createdAt: -1})
    .skip(skip)
    .limit(limit);

    return res.status(200).json({
      success:true,
      data: movements,
      pagination:{
        currentPage: page,
        totalPages: Math.ceil(totalMovements/limit),
        totalMovements: totalMovements,
        limit:limit
      }
    });
  }catch(err){
    return res.status(500).json({
      success: false,
      message: err.message
    });
  };
}

module.exports = {getMovements};