const mongoose = require("mongoose");
const Supplier = require("../models/Supplier");

//<----------CREATE SUPPLIER------------>
const createSupplier = async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Supplier name is required"
            });
        }

        const supplier = await Supplier.create({
            name,
            email,
            phone,
            address
        });

        return res.status(201).json({
            success: true,
            message: "Supplier created successfully",
            data: supplier
        });

    } catch (error) {
        console.error("Create Supplier Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


//<----------GET ALL SUPPLIERS------------>
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await Supplier.find()
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: suppliers.length,
            data: suppliers
        });

    } catch (error) {
        console.error("Get Suppliers Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


//<----------GET SINGLE SUPPLIER------------>
const getSupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid supplier ID"
            });
        }

        const supplier = await Supplier.findById(supplierId);

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: supplier
        });

    } catch (error) {
        console.error("Get Supplier Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


//<----------UPDATE SUPPLIER------------>
const updateSupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid supplier ID"
            });
        }

        const { name, email, phone, address } = req.body;

        const supplier = await Supplier.findByIdAndUpdate(
            supplierId,
            {
                name,
                email,
                phone,
                address
            },
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Supplier updated successfully",
            data: supplier
        });

    } catch (error) {
        console.error("Update Supplier Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


//<----------DELETE SUPPLIER------------>
const deleteSupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid supplier ID"
            });
        }

        const supplier = await Supplier.findByIdAndDelete(supplierId);

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Supplier deleted successfully"
        });

    } catch (error) {
        console.error("Delete Supplier Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


module.exports = {
    createSupplier,
    getSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier
};