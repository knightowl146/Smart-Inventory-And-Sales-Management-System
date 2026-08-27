require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 3000;


async function startServer() {
    await connectDB();
    console.log("db connected!");
    app.listen(PORT, () => {
        console.log(`The server is running on port ${PORT}`);
    });
}

startServer().catch((err) => {
    console.log(err);
});

