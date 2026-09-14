const logger = require("../../utils/logger");
const { roleHas } = require("../../middlewares/permissions");
const { TOOLS_BY_NAME } = require("./tools");

/**
 * Runs one tool call the model asked for.
 *
 * The order of the checks is the whole point:
 *
 *   1. Is this a tool that exists?  (the model can hallucinate a name)
 *   2. Does the CALLER hold its permission?
 *   3. Only then, touch the database.
 *
 * Step 2 uses the same roleHas() table as the HTTP route guards. That means an
 * employee cannot reach profit data through the assistant even though the
 * assistant itself runs with server credentials - the check is against the
 * person who asked, and it happens before any query runs. No prompt wording
 * changes the outcome, because by this point the prompt is already behind us.
 *
 * A refusal is returned to the model as data, not thrown, so it can tell the
 * user plainly rather than failing the whole turn.
 */
const executeTool = async (name, args, user) => {
  const tool = TOOLS_BY_NAME.get(name);

  if (!tool) {
    return { ok: false, refused: false, error: `No tool named "${name}".` };
  }

  if (!roleHas(user.role, tool.permission)) {
    logger.info(
      `AI tool "${name}" refused for ${user.email} (${user.role}) - requires ${tool.permission}`
    );

    return {
      ok: false,
      refused: true,
      error: `The signed-in user does not have permission to access this information. Tell them this is restricted to owner accounts and do not speculate about the answer.`,
    };
  }

  try {
    const data = await tool.handler(args || {}, user);
    return { ok: true, refused: false, data };
  } catch (err) {
    logger.error(`AI tool "${name}" failed: ${err.message}`);
    return { ok: false, refused: false, error: `That lookup failed: ${err.message}` };
  }
};

module.exports = { executeTool };
