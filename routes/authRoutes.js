const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const router = express.Router();

const {
  login,
  refresh,
  logout,
  logoutEverywhere,
  me,
  changePassword,
} = require("../controllers/authController");
const { requireAuth } = require("../middlewares/auth");

/**
 * Credential endpoints get their own, much tighter limit than the app-wide one.
 * The global limiter (1000 / 15 min) is sized for a dashboard that fires a
 * dozen requests per page; it is useless against password guessing.
 *
 * Keyed on IP + submitted email so that one attacker cannot lock out every user
 * behind a shared NAT, and skipSuccessfulRequests means a person legitimately
 * signing in and out all day never trips it.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator normalises IPv6 to its /56 prefix. Using req.ip raw would
  // let anyone on an IPv6 network sidestep the limit by rotating addresses
  // within their own prefix - express-rate-limit v8 refuses to start without it.
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${String(req.body?.email || "").toLowerCase()}`,
  message: {
    success: false,
    message: "Too many sign-in attempts. Try again in 15 minutes.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, login);
router.post("/refresh", refreshLimiter, refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, me);
router.post("/logout-all", requireAuth, logoutEverywhere);
router.post("/change-password", requireAuth, changePassword);

module.exports = router;
