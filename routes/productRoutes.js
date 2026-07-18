const Product = require("../models/Product");

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
