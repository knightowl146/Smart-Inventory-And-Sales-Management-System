const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const stockMovementRoutes = require("./routes/stockMovementRoutes");
const productRoutes = require("./routes/productRoutes");
const dashboardRoutes = require("./routes/dashboardRoute.js");
const analyticsRoutes = require("./routes/analyticsRoutes.js");

//middlewares
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

//Routes
app.use("/api/products", productRoutes);
app.use("/products", productRoutes);
app.use("/api/movements", stockMovementRoutes);
app.use("/movements", stockMovementRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to Smart Inventory API");
});


//Export the app instance for use in server.js
module.exports = app;