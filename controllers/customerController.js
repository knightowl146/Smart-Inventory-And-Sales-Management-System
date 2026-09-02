const mongoose = require("mongoose");
const Customer = require("../models/Customer");

// Create Customer
const createCustomer = async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;

        // Required fields
        if (!name || !phone) {
            return res.status(400).json({
                message: "Name and phone are required"
            });
        }

        // Check duplicate phone
        const existingCustomer = await Customer.findOne({ phone });

        if (existingCustomer) {
            return res.status(409).json({
                message: "Customer with this phone number already exists"
            });
        }

        const customer = await Customer.create({
            name,
            phone,
            email,
            address
        });

        return res.status(201).json({
            message: "Customer created successfully",
            customer
        });

    } catch (error) {
        console.error("Error creating customer:", error);

        // MongoDB duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Customer with this phone number already exists"
            });
        }

        return res.status(500).json({
            message: "Server error while creating customer"
        });
    }
};


// Get All Customers
const getCustomers = async (req, res) => {
    try {
        const customers = await Customer.find()
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: customers.length,
            customers
        });

    } catch (error) {
        console.error("Error fetching customers:", error);

        return res.status(500).json({
            message: "Server error while fetching customers"
        });
    }
};


// Get Customer By ID
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid customer ID"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            customer
        });

    } catch (error) {
        console.error("Error fetching customer:", error);

        return res.status(500).json({
            message: "Server error while fetching customer"
        });
    }
};


// Update Customer
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address } = req.body;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid customer ID"
            });
        }

        // Find customer
        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        // Validate name if provided
        if (name !== undefined && !name.trim()) {
            return res.status(400).json({
                message: "Name cannot be empty"
            });
        }

        // Validate phone if provided
        if (phone !== undefined && !phone.trim()) {
            return res.status(400).json({
                message: "Phone cannot be empty"
            });
        }

        // Check duplicate phone
        if (phone !== undefined && phone !== customer.phone) {
            const existingCustomer = await Customer.findOne({
                phone,
                _id: { $ne: id }
            });

            if (existingCustomer) {
                return res.status(409).json({
                    message: "Customer with this phone number already exists"
                });
            }
        }

        // Update only provided fields
        if (name !== undefined) customer.name = name;
        if (phone !== undefined) customer.phone = phone;
        if (email !== undefined) customer.email = email;
        if (address !== undefined) customer.address = address;

        const updatedCustomer = await customer.save();

        return res.status(200).json({
            message: "Customer updated successfully",
            customer: updatedCustomer
        });

    } catch (error) {
        console.error("Error updating customer:", error);

        // MongoDB duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Customer with this phone number already exists"
            });
        }

        return res.status(500).json({
            message: "Server error while updating customer"
        });
    }
};


// Delete Customer
const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid customer ID"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        await Customer.findByIdAndDelete(id);

        return res.status(200).json({
            message: "Customer deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting customer:", error);

        return res.status(500).json({
            message: "Server error while deleting customer"
        });
    }
};


module.exports = {
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
};