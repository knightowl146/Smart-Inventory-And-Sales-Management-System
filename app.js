const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("@exortek/express-mongo-sanitize");
const compression = require("compression");
const morgan = require("morgan");
const env = require("./config/env");
const logger = require("./utils/logger");
const errorHandler = require("./middlewares/errorHandler");
const { requestContext } = require("./middlewares/requestContext");
const { responseFilter } = require("./middlewares/responseFilter");
const { auditTrail } = require("./middlewares/auditTrail");

const stockMovementRoutes = require("./routes/stockMovementRoutes");
const productRoutes = require("./routes/productRoutes");
const dashboardRoutes = require("./routes/dashboardRoute.js");
const analyticsRoutes = require("./routes/analyticsRoutes.js");
const supplierRoutes = require("./routes/supplierRoutes");
const customerRoutes = require("./routes/customerRoutes");
const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const auditRoutes = require("./routes/auditRoutes");
const meRoutes = require("./routes/meRoutes");
const aiRoutes = require("./routes/aiRoutes");

// Setup morgan to use winston for HTTP logging
if (env.NODE_ENV !== "test") {
  app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Trust the first hop reverse proxy (load balancer/PaaS router) in production,
// so req.ip and the rate limiter see the real client IP from X-Forwarded-For
// rather than the proxy's own address. Safe to leave off in dev (no proxy).
//
// With the Vercel rewrite in front of this service there are two hops, but only
// the last one (Render's router) is ours to trust; Vercel forwards the client
// IP it saw, so a value of 1 still resolves to the real client.
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Set security HTTP headers
app.use(helmet());

// CORS: in production, only allow explicitly configured origin(s) - set
// CORS_ORIGIN to a comma-separated list (e.g. "https://app.example.com").
// In development, allow any origin so local Vite ports just work.
//
// `credentials: true` is what permits the browser to send the refresh cookie.
// Note that the normal path for both dev and production is same-origin (Vite
// proxies /api locally, Vercel rewrites /api in production), so CORS is a
// fallback for direct API access rather than the main route in.
const corsOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : null;

if (env.NODE_ENV === "production" && !corsOrigins) {
  logger.warn(
    "CORS_ORIGIN is not set in production - no origins are allowlisted, so cross-origin requests from a browser frontend will be blocked. Set CORS_ORIGIN to your frontend's URL(s)."
  );
}

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : env.NODE_ENV === "production" ? false : true,
    credentials: true,
  })
);

// Enable payload compression
app.use(compression());

// Limit repeated failed requests to endpoints.
// Note this is a coarse app-wide ceiling sized for a dashboard that fires many
// requests per page - the credential endpoints have their own much tighter
// limiter in routes/authRoutes.js.
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
// parse the httpOnly refresh-token cookie
app.use(cookieParser());

// Sanitize request data against MongoDB operator injection (strips keys
// starting with "$" or containing "." from body/query/params). Uses the
// @exortek fork rather than the original express-mongo-sanitize package,
// since the original mutates req.query by reassignment, which Express 5
// no longer allows (req.query is a getter-only property) and crashes every
// request that reaches it.
app.use(mongoSanitize());

// Makes the current request (and, once requireAuth has run, the current user)
// reachable from the audit service without threading `req` through every call.
app.use(requestContext);

// Wraps res.json so cost and margin fields are stripped for any role that does
// not hold "finance:read". Registered before the routes so it is in place for
// every handler; it no-ops until requireAuth has populated req.user.
app.use(responseFilter);

// Records every successful state-changing request. Controllers add richer,
// explicit entries on top of this for auth events and stock movements.
app.use(auditTrail);

// Health check for load balancers / container orchestrators / uptime monitors.
// Reports basic liveness plus MongoDB connection state; intentionally not
// rate-limited, not behind /api and not authenticated so infra can poll it freely.
app.get("/health", (req, res) => {
  const dbStateNames = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = dbStateNames[mongoose.connection.readyState] || "unknown";

  res.status(dbState === "connected" ? 200 : 503).json({
    status: dbState === "connected" ? "ok" : "degraded",
    db: dbState,
    uptime: process.uptime(),
  });
});

// Routes.
//
// Every router mounts exactly once, under /api. The bare-path duplicates that
// used to sit alongside these (/products, /movements, ...) were removed: every
// router now attaches its own requireAuth and can() guards internally, and a
// second mount point is a standing invitation to protect one and forget the
// other. The frontend has always called /api exclusively.
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/me", meRoutes);
app.use("/api/ai", aiRoutes);

app.use("/api/products", productRoutes);
app.use("/api/movements", stockMovementRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/reports", reportRoutes);

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
