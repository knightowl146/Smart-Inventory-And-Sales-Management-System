const User = require("../models/User");
const { verifyAccessToken } = require("../services/tokenService");

const readBearerToken = (req) => {
  const header = req.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

const unauthorized = (res, message = "Authentication required") =>
  res.status(401).json({ success: false, code: 401, message });

/**
 * Verifies the access token and loads the user.
 *
 * The database lookup on every request is deliberate. A pure stateless check
 * would keep honouring a token for its full 15 minutes after an account is
 * deactivated or a password is changed; checking `isActive` and `tokenVersion`
 * against the current record makes revocation immediate. At this scale one
 * indexed findById per request is not a meaningful cost, and it can be replaced
 * with a short-TTL cache later without changing any caller.
 */
const requireAuth = async (req, res, next) => {
  try {
    const token = readBearerToken(req);

    if (!token) return unauthorized(res);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      const expired = err.name === "TokenExpiredError";
      return unauthorized(
        res,
        expired ? "Access token expired" : "Invalid access token"
      );
    }

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return unauthorized(res, "Account is inactive or no longer exists");
    }

    if (user.tokenVersion !== payload.tv) {
      return unauthorized(res, "Session has been revoked, please sign in again");
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireAuth, readBearerToken };
