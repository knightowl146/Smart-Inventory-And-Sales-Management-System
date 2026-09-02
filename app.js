const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");
const morgan = require("morgan");
const env = require("./config/env");
const logger = require("./utils/logger");
const errorHandler = require("./middlewares/errorHandler");

const stockMovementRoutes = require("./routes/stockMovementRoutes");
const productRoutes = require("./routes/productRoutes");
const dashboardRoutes = require("./routes/dashboardRoute.js");
const analyticsRoutes = require("./routes/analyticsRoutes.js");
const supplierRoutes = require("./routes/supplierRoutes");
const customerRoutes = require("./routes/customerRoutes");
const reportRoutes = require("./routes/reportRoutes");

// Setup morgan to use winston for HTTP logging
if (env.NODE_ENV !== "test") {
  app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Set security HTTP headers
app.use(helmet());

// Enable CORS with reasonable defaults (restrict in real prod to specific origins)
app.use(cors());

// Enable payload compression
app.use(compression());

// Limit repeated failed requests to endpoints
const limiter = rateLimit({
  max: 1000,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many requests from this IP, please try again in 15 minutes."
});
app.use("/api", limiter);

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));
// parse json request body
app.use(express.json());

// sanitize request data
// app.use(mongoSanitize());
// app.use(xss());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/products", productRoutes);
app.use("/products", productRoutes);
app.use("/api/movements", stockMovementRoutes);
app.use("/movements", stockMovementRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/customers", customerRoutes);
app.use("/api/reports", reportRoutes);
app.use("/reports", reportRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to Smart Inventory API");
});

// Handle unknown API requests
app.use((req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
});

// Global error handler
app.use(errorHandler);

// Export the app instance for use in server.js
module.exports = app;