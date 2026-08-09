const express = require("express");
const app = express();
const path = require("path");
const stockMovementRoutes = require("./routes/stockMovementRoutes");

//middlewares
app.use(express.urlencoded({extended: true}));
app.set("view engine","ejs");
app.set("views", path.join(__dirname,"views"));
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json());
app.use("/api/movements",stockMovementRoutes);


app.get("/", (req,res)=>{
    res.send("Welcome to Smart Inventory API");
})

//Export the app instance for use in server.js
module.exports = app;