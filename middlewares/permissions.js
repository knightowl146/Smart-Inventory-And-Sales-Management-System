/**
 * Role definitions live here and nowhere else.
 *
 * Permissions are declared as data rather than as `if (role === "owner")`
 * scattered through the controllers, so that:
 *   - the whole policy is auditable by reading one file,
 *   - adding a third role is a data change, not a code change,
 *   - the same map can be handed to future features (the planned natural
 *     language query layer runs its tool calls through `can()` as well).
 *
 * Owner holds the wildcard. Employee holds an explicit allowlist - anything not
 * listed is denied, so a new endpoint is locked down by default rather than
 * accidentally open.
 */
const PERMISSIONS = Object.freeze({
  owner: ["*"],

  employee: [
    "product:read", // catalogue, with cost fields stripped by responseFilter
    "product:sell", // recording a sale is the employee's core job
    "customer:read",
    "customer:create", // walk-in customers
    "movement:read:own", // their own sales only, never the whole ledger
    "me:read",
  ],
});

const ALL_ROLES = Object.keys(PERMISSIONS);

const roleHas = (role, permission) => {
  const granted = PERMISSIONS[role];
  if (!granted) return false;
  return granted.includes("*") || granted.includes(permission);
};

/**
 * Route guard. Pass a single permission or an array; an array means "any of".
 *
 * Must run after requireAuth - it assumes req.user exists and fails closed if
 * it does not, so a mis-ordered router still denies rather than allows.
 */
const can = (permission) => {
  const required = Array.isArray(permission) ? permission : [permission];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: "Authentication required",
      });
    }

    const allowed = required.some((perm) => roleHas(req.user.role, perm));

    if (allowed) return next();

    return res.status(403).json({
      success: false,
      code: 403,
      message: "You do not have permission to perform this action",
    });
  };
};

module.exports = { PERMISSIONS, ALL_ROLES, can, roleHas };
