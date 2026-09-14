const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

/**
 * Two-token scheme.
 *
 *  - Access token: short-lived (15 min), sent in the Authorization header and
 *    held only in JavaScript memory on the client. Never written to
 *    localStorage, so an XSS payload cannot read a token that outlives the page.
 *
 *  - Refresh token: long-lived (7 days), sent only as an httpOnly cookie scoped
 *    to /api/auth, so page JavaScript cannot read it at all and it is not
 *    attached to any other request.
 *
 * Separate secrets for the two so that a leaked access-token secret cannot be
 * used to mint refresh tokens.
 */

const REFRESH_COOKIE_NAME = "sisms_rt";
const ISSUER = "smart-inventory-api";

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const signAccessToken = (user) =>
  jwt.sign(
    { role: user.role, tv: user.tokenVersion },
    env.JWT_ACCESS_SECRET,
    {
      subject: user._id.toString(),
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: ISSUER,
      audience: "access",
    }
  );

/**
 * @returns {{ token: string, jti: string, expiresAt: Date }}
 */
const signRefreshToken = (user) => {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + refreshTtlMs());

  const token = jwt.sign(
    { jti, tv: user.tokenVersion },
    env.JWT_REFRESH_SECRET,
    {
      subject: user._id.toString(),
      expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
      issuer: ISSUER,
      audience: "refresh",
    }
  );

  return { token, jti, expiresAt };
};

const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: "access",
  });

const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: ISSUER,
    audience: "refresh",
  });

/**
 * Cookie flags.
 *
 * `sameSite: "lax"` is only safe because the frontend reaches the API through a
 * same-origin path: Vite proxies /api in development and Vercel rewrites /api
 * in production (see frontend/vite.config.js and frontend/vercel.json). If the
 * browser ever talks to the Render host directly this cookie will not be sent -
 * which is the intended failure mode, not a bug to work around with
 * SameSite=None.
 *
 * `path` narrows the cookie to the auth endpoints, so it is not attached to the
 * hundred-odd other API requests the app makes.
 */
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
  maxAge: refreshTtlMs(),
});

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
};

const clearRefreshCookie = (res) => {
  // maxAge must be omitted when clearing or Express will not emit an expiry.
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
};

module.exports = {
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  refreshTtlMs,
};
