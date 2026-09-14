const { AsyncLocalStorage } = require("node:async_hooks");

/**
 * Carries "who is making this request" through the async call stack so that
 * code far from the route handler - the audit service, model hooks - can find
 * the actor without every function in between taking a `req` parameter.
 *
 * This is read-only context. Nothing here is used for an authorisation
 * decision; those all happen in middleware that has `req` in hand.
 */
const storage = new AsyncLocalStorage();

const requestContext = (req, res, next) => {
  storage.run({ req }, next);
};

const getContext = () => storage.getStore() || {};

const getActor = () => {
  const { req } = getContext();
  const user = req?.user;

  if (!user) {
    return { id: null, email: "anonymous", role: "anonymous" };
  }

  return { id: user.id, email: user.email, role: user.role };
};

const getRequestMeta = () => {
  const { req } = getContext();
  return {
    ip: req?.ip || null,
    userAgent: req?.get?.("user-agent") || null,
  };
};

module.exports = { requestContext, getContext, getActor, getRequestMeta };
