const { generateJson, isConfigured } = require("./client");

/**
 * Turning a flagged row into a sentence.
 *
 * This is the only thing the model does in the anomaly feature. The statistics
 * decided what is anomalous and by how much; Gemini is handed those numbers and
 * asked to say what they might mean and what to check. It is explicitly told
 * not to produce figures of its own, and the UI renders its sentence beside the
 * numbers it was given so a reader can check it.
 *
 * If no key is configured, or the call fails, the feature keeps working - the
 * findings render with their numbers and no commentary.
 */

const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    narratives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          explanation: { type: "string" },
          suggestedCheck: { type: "string" },
        },
        required: ["index", "explanation", "suggestedCheck"],
      },
    },
  },
  required: ["narratives"],
};

const PROMPT_HEADER = `
You are reviewing anomalies a shop's inventory system has already detected
statistically. For each one, write:

  explanation     one sentence on what the pattern is, in plain language
  suggestedCheck  one short, concrete thing the owner should look at

Hard rules:
- Do NOT state any number that is not in the data given to you.
- Do NOT accuse anyone of anything. A discount may have been authorised; a spike
  may have been a bulk order. Describe, suggest a check, and stop.
- No preamble, no hedging phrases, no restating the data back.
- Keep each field under 200 characters.
`.trim();

/**
 * @param {Array<object>} anomalies
 * @returns {Promise<Record<number, {explanation: string, suggestedCheck: string}>>}
 */
const explainAnomalies = async (anomalies) => {
  if (!isConfigured() || anomalies.length === 0) return {};

  const payload = anomalies.map((anomaly, index) => ({ index, ...anomaly }));

  const result = await generateJson({
    prompt: `${PROMPT_HEADER}\n\nAnomalies:\n${JSON.stringify(payload, null, 2)}`,
    responseSchema: NARRATIVE_SCHEMA,
    feature: "anomaly",
  });

  if (!result?.narratives) return {};

  const byIndex = {};
  for (const narrative of result.narratives) {
    if (Number.isInteger(narrative.index)) {
      byIndex[narrative.index] = {
        explanation: narrative.explanation,
        suggestedCheck: narrative.suggestedCheck,
      };
    }
  }

  return byIndex;
};

module.exports = { explainAnomalies, NARRATIVE_SCHEMA };
