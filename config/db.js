const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGO_URI);
        console.log("Database connected");
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}

module.exports = connectDB;