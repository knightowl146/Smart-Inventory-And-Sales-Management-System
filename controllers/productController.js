const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements")

//<------------CREATE PRODUCT----------->
const createProduct = async (req,res) =>{

    try{
        // Destructure req.body
        const {name, sku, category,purchasePrice,sellingPrice,quantity,description} = req.body;
        // Validation
        if(!name || !sku || !category || purchasePrice==null || sellingPrice==null || quantity == null || !description){
            return res.status(400).json({
                success: false,
                message:"All fields are required"
            });
        }
        // MongoDB query to create a new product
        const product = await Product.create({
            name,
            sku,
            category,
            purchasePrice,
            sellingPrice,
            quantity,
            description
        });
        // Respond with success message
        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product
        });
    }catch(error){
        // Error handling
        return res.status(500).json({
            success: false,
            message: "Internal Server error"
        });
    }
}
//<-----------GET ALL PRODUCTS------------->
const getProducts = async (req,res) =>{
    try{     
        const products = await Product.find();

        return res.status(200).json({
            success: true,
            message: "Products fetched successfully",
            data: products
        })
    }
    catch(err){
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        })
    }   
}
//<-------------SEARCH PRODUCT BY ID--------------->
const getProductById = async(req,res) =>{

  try{

    const {id} = req.params;
    //Validating id
    const isValid = mongoose.Types.ObjectId.isValid(id);
    if(!isValid){
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }
    const product = await Product.findById(id);

    // Product doesn't exist
    if(!product){
      return res.status(404).json({
        success: false,
        message: "Product doesn't exist"
      });
    }
    //Product found 
    return res.status(200).json({
      success: true,
      message: "Product found!",
      data: product
    });
  }
  catch(err){
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
//<------------------UPDATE PRODUCT----------------->
const updateProduct = async (req,res) =>{

  try{
    // Validating id
    const isValid = mongoose.Types.ObjectId.isValid(req.params.id);
    if(!isValid){
      return res.status(404).json({
        success: false,
        message: "Invalid id"
      })
    };
    // Validating requested updates
    const allowedUpdates = new Set([
      "name",
      "price",
      "quantity",
      "category",
      "description"
    ]);
    const updates = Object.keys(req.body);
    const isValidUpdate = updates.every( (field)=> allowedUpdates.has(field));
    if(!isValidUpdate){
      return res.status(400).json({
        success: false,
        message: "Invalid updates"
      })
    };
    // Updating product
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
  
    if(!product){
      return res.status(400).json({
      success: false,
      message: "Product not found"
    })
    }
    return res.status(200).json({
      success: true,
      message: "Product updated",
      data: product
    });
  }
  catch(err){
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

//<----------DELETE PRODUCT----------->
const deleteProduct = async (req,res)=>{
  try{
    const {id} = req.params;
    const isValid = mongoose.Types.ObjectId.isValid(id);
    if(!isValid){
      return res.status(400).json({
        success: false,
        message: "Invalid id"
      });
    }
    const product = await Product.findByIdAndDelete(id);
    if(!product){
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    return res.status(200).json({
      success: true,
      message: "Product deleted",
      data: product
    });
  }
  catch(err){
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  };
};


//<-----------------PURCHASE PRODUCT--------------->
const purchaseProduct = async (req,res)=>{


  try{
    const {quantity} = req.body;
    const {id} = req.params;
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    if(!isValidId){
      return res.status(400).json({
        success: false,
        message: "Invalid id"
      });
    }
    if(typeof quantity !== 'number' || isNaN(quantity)){
      return res.status(400).json({
        success: false,
        message: "Quantity is required and must be a number"
      });

    }
    if(quantity <= 0){
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0"
      });
    }
    if(!Number.isInteger(quantity)){
      return res.status(400).json({
        success: false,
        message: "Quantity must be an integer"
      });
    }
    
    const product = await Product.findByIdAndUpdate(
        id,
        {
            $inc: {
                quantity: quantity
            }
        },
        {
          new: true,
          runValidators: true
        }
    )
    if(!product){
        return res.status(404).json({
            success:false,
            message:"Product not found"
        });
    }

    const newQuantity = product.quantity;
    const prevQuantity = newQuantity - quantity;
    await StockMovement.create({
      product: product._id,
      type: "PURCHASE",
      quantity: quantity,
      previousStock: prevQuantity,
      newStock: newQuantity
    })

    return res.status(200).json({
        success:true,
        message: "Stock added successfully",
        data: product
    });
    
  }
  catch(err){
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  };
};


//<-----------------SELL PRODUCT--------------->
const sellProduct = async (req,res)=>{

  try{
    const {quantity} = req.body;
    const {id} = req.params;
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    if(!isValidId){
      return res.status(400).json({
        success: false,
        message: "Invalid id"
      });
    }
    if(typeof quantity !== 'number' || isNaN(quantity)){
      return res.status(400).json({
        success: false,
        message: "Quantity is required and must be a number"
      });

    }
    if(quantity <= 0){
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0"
      });
    }
    if(!Number.isInteger(quantity)){
      return res.status(400).json({
        success: false,
        message: "Quantity must be an integer"
      });
    }

    // here we are using filters to check if the sale is valid
    const product = await Product.findOneAndUpdate({
      _id:id,
      quantity: {
        $gte: quantity
      }
    },
    {
      $inc:{
        quantity: -quantity
      }
    },
    {
      new: true,
      runValidators: true
    })

    // product == null when the filter rejects the sale
    if(!product){
      res.status(404).json({
        success: false,
        message: "Insufficient stock"
      })
    }
    const newQuantity = product.quantity;
    const prevQuantity = newQuantity + quantity;

    await StockMovement.create({
      product: product._id,
      type: "SALE",
      quantity: quantity,
      previousStock: prevQuantity,
      newStock: newQuantity
    })

    res.status(200).json({
      success: true,
      message: "Product sold successfully",
      data: product
    })
  }
  catch(error){
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
