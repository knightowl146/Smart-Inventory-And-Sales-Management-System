const User = require("../models/User");
const audit = require("../services/auditService");
const {
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require("../services/tokenService");

const MAX_SESSIONS_PER_USER = 5;

/**
 * The same message for "no such account" and "wrong password". Distinguishing
 * them turns the login form into an account-enumeration oracle.
 */
const INVALID_CREDENTIALS = "Invalid email or password";

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
});

const pruneSessions = (user) => {
  const now = Date.now();
  user.sessions = user.sessions.filter((s) => s.expiresAt.getTime() > now);

  // Oldest sessions fall off once the cap is reached, so a user cannot
  // accumulate refresh tokens indefinitely by logging in from new devices.
  if (user.sessions.length >= MAX_SESSIONS_PER_USER) {
    user.sessions = user.sessions.slice(-(MAX_SESSIONS_PER_USER - 1));
  }
};

const issueSession = async (user, req, res) => {
  const refresh = signRefreshToken(user);

  pruneSessions(user);
  user.sessions.push({
    jti: refresh.jti,
    userAgent: req.get("user-agent") || "",
    ip: req.ip || "",
    expiresAt: refresh.expiresAt,
  });

  await user.save();
  setRefreshCookie(res, refresh.token);

  return signAccessToken(user);
};

//<---------------- POST /api/auth/login ---------------->
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+passwordHash +sessions");

    if (!user) {
      audit.record({
        action: "auth.login",
        outcome: "failure",
        meta: { email: email.toLowerCase().trim(), reason: "no_such_user" },
        actor: { id: null, email: email.toLowerCase().trim(), role: "anonymous" },
      });
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    const passwordMatches = await user.verifyPassword(password);

    if (!passwordMatches) {
      audit.record({
        action: "auth.login",
        outcome: "failure",
        entityType: "User",
        entityId: user._id,
        meta: { reason: "bad_password" },
        actor: { id: user._id, email: user.email, role: user.role },
      });
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    // Checked after the password so a deactivated account cannot be identified
    // by probing without valid credentials.
    if (!user.isActive) {
      audit.record({
        action: "auth.login",
        outcome: "failure",
        entityType: "User",
        entityId: user._id,
        meta: { reason: "inactive" },
        actor: { id: user._id, email: user.email, role: user.role },
      });
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Contact the owner.",
      });
    }

    user.lastLoginAt = new Date();
    const accessToken = await issueSession(user, req, res);

    audit.record({
      action: "auth.login",
      entityType: "User",
      entityId: user._id,
      actor: { id: user._id, email: user.email, role: user.role },
    });

    return res.status(200).json({
      success: true,
      message: "Signed in",
      data: { accessToken, user: publicUser(user) },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/auth/refresh ---------------->
/**
 * Rotating refresh tokens with reuse detection.
 *
 * Every refresh consumes the presented token's jti and issues a new one. If a
 * token is presented whose jti is no longer in the user's session list, it was
 * either already rotated or stolen - and we cannot tell which, so we assume the
 * worst: every session is dropped and tokenVersion is bumped, forcing a fresh
 * login everywhere. This is the standard OAuth 2.1 guidance for public clients.
 */
const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ success: false, message: "No refresh token" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.sub).select("+sessions");

    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: "Session is no longer valid" });
    }

    const index = user.sessions.findIndex((s) => s.jti === payload.jti);

    if (index === -1) {
      user.sessions = [];
      user.tokenVersion += 1;
      await user.save();
      clearRefreshCookie(res);

      audit.record({
        action: "auth.refresh_reuse_detected",
        outcome: "failure",
        entityType: "User",
        entityId: user._id,
        meta: { jti: payload.jti },
        actor: { id: user._id, email: user.email, role: user.role },
      });

      return res.status(401).json({
        success: false,
        message: "Session reuse detected. All sessions have been revoked.",
      });
    }

    user.sessions.splice(index, 1);
    const accessToken = await issueSession(user, req, res);

    return res.status(200).json({
      success: true,
      data: { accessToken, user: publicUser(user) },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/auth/logout ---------------->
const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];

    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const user = await User.findById(payload.sub).select("+sessions");

        if (user) {
          user.sessions = user.sessions.filter((s) => s.jti !== payload.jti);
          await user.save();

          audit.record({
            action: "auth.logout",
            entityType: "User",
            entityId: user._id,
            actor: { id: user._id, email: user.email, role: user.role },
          });
        }
      } catch {
        // An expired or malformed cookie still logs out cleanly - there is
        // nothing to revoke and nothing useful to tell the caller.
      }
    }

    clearRefreshCookie(res);
    return res.status(200).json({ success: true, message: "Signed out" });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/auth/logout-all ---------------->
const logoutEverywhere = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("+sessions");

    user.sessions = [];
    user.tokenVersion += 1;
    await user.save();

    clearRefreshCookie(res);
    audit.record({
      action: "auth.logout_all",
      entityType: "User",
      entityId: user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Signed out of all devices",
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/auth/me ---------------->
const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({ success: false, message: "Account no longer exists" });
    }

    return res.status(200).json({ success: true, data: publicUser(user) });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/auth/change-password ---------------->
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < User.MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `New password must be at least ${User.MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await User.findById(req.user.id).select("+passwordHash +sessions");
    const matches = await user.verifyPassword(currentPassword);

    if (!matches) {
      audit.record({
        action: "auth.change_password",
        outcome: "failure",
        entityType: "User",
        entityId: user._id,
      });
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    await user.setPassword(newPassword);

    // Changing a password invalidates every existing session, including other
    // devices - that is the point of changing it.
    user.sessions = [];
    user.tokenVersion += 1;

    const accessToken = await issueSession(user, req, res);

    audit.record({
      action: "auth.change_password",
      entityType: "User",
      entityId: user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Password updated. Other devices have been signed out.",
      data: { accessToken, user: publicUser(user) },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  logoutEverywhere,
  me,
  changePassword,
  publicUser,
};
