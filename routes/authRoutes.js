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

/**
 * Every sign-in from one address, successful or not.
 *
 * The limiter above deliberately ignores successful sign-ins, so a shop signing
 * people in and out all day is never locked out. But the demo password is
 * public, and a successful sign-in still writes to the database - the sign-in
 * time, an activity-log entry - so an unlimited stream of them is a cheap way
 * to fill both. Thirty an hour is far beyond anyone using the app by hand.
 */
const loginBurstLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many sign-ins from this network. Try again in an hour.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginBurstLimiter, loginLimiter, login);
router.post("/refresh", refreshLimiter, refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, me);
router.post("/logout-all", requireAuth, logoutEverywhere);
router.post("/change-password", requireAuth, changePassword);

module.exports = router;
