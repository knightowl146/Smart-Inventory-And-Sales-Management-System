const app = require("./app");
const mongoose = require("mongoose");
require("dotenv").config();
const PORT = process.env.PORT;



async function main() {
    await mongoose.connect('mongodb://localhost:27017/inventory');
    console.log("Database connected");
}


app.listen(PORT, () => {
    console.log(`The server is running on port ${PORT}`);
});
