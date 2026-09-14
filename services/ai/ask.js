const { generate, isConfigured } = require("./client");
const { toolDeclarationsFor } = require("./tools");
const { executeTool } = require("./toolExecutor");

/**
 * "Ask your inventory."
 *
 * A bounded agent loop: the model may call tools, see their results, and call
 * more, up to a hard cap. The cap matters - without it a confused model can
 * ping-pong between lookups until the request times out or the bill does.
 *
 * The loop is deliberately small and readable rather than a framework. Four
 * steps is enough for "find the product, then forecast it, then answer", which
 * is the deepest chain any of these questions needs.
 */

const MAX_TOOL_ROUNDS = 4;

const systemInstruction = (user, today) => `
You are the analyst for a shop's inventory and sales system. You are talking to
${user.name}, whose role is "${user.role}".

Today is ${today}.

Rules you must follow:

- Answer ONLY from data returned by the tools. Never estimate, extrapolate or
  fill a gap from general knowledge. If the tools do not cover something, say
  what you would need.
- Never invent a number. Every figure in your answer must have come from a tool
  result in this conversation.
- If a tool reports that the user lacks permission, tell them plainly that the
  information is restricted to owner accounts. Do not guess at it, do not
  approximate it from other figures, and do not explain how they might obtain it.
- Prefer calling a tool over asking a clarifying question. If a period is not
  specified, use the last 30 days and say so.
- Be brief. Two or three sentences for a simple question. Lead with the number
  the person asked for.
- Amounts are in the shop's own currency; write them plainly (1,250) without a
  currency symbol.
`.trim();

/**
 * @param {string} question
 * @param {{id: string, name: string, email: string, role: string}} user
 * @returns {Promise<{answer: string, toolCalls: Array, refused: boolean, available: boolean}>}
 */
const ask = async (question, user) => {
  if (!isConfigured()) {
    return {
      available: false,
      answer:
        "The assistant is not configured on this server - no Gemini API key is set. Every figure it would quote is still available on the Analytics and Reports pages.",
      toolCalls: [],
      refused: false,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const declarations = toolDeclarationsFor(user.role);

  const contents = [{ role: "user", parts: [{ text: question }] }];
  const toolCalls = [];
  let refused = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await generate({
      contents,
      config: {
        systemInstruction: systemInstruction(user, today),
        tools: [{ functionDeclarations: declarations }],
        temperature: 0.2,
      },
      feature: "ask",
      userId: user.id,
      // Tool-using turns are conversational state; caching them would replay a
      // previous conversation's tail into a new one.
      cacheable: false,
    });

    if (!response) {
      return {
        available: true,
        answer:
          "The assistant could not be reached just now. The underlying figures are on the Analytics and Reports pages.",
        toolCalls,
        refused,
      };
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall);

    if (calls.length === 0) {
      return {
        available: true,
        answer: response.text?.trim() || "No answer was produced.",
        toolCalls,
        refused,
      };
    }

    // Record the model's turn before appending results, so the transcript stays
    // in the order the API expects.
    contents.push({ role: "model", parts });

    const responseParts = [];

    for (const call of calls) {
      const result = await executeTool(call.name, call.args, user);

      if (result.refused) refused = true;

      toolCalls.push({
        name: call.name,
        args: call.args ?? {},
        ok: result.ok,
        refused: result.refused,
      });

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: result.ok ? { data: result.data } : { error: result.error },
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  return {
    available: true,
    answer:
      "That question needed more lookups than the assistant is allowed in one go. Try asking for one thing at a time.",
    toolCalls,
    refused,
  };
};

module.exports = { ask, MAX_TOOL_ROUNDS };
