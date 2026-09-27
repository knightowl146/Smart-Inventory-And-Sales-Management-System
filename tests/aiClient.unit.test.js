/**
 * What the AI client actually sends to Gemini.
 *
 * Checked by capturing the request rather than by reading the code, because the
 * failure this guards against is silent: a thinking setting a model does not
 * understand is rejected by the API on every single call, and the app degrades
 * to "the assistant could not be reached" with nothing obviously wrong.
 */

const loadClient = (env = {}) => {
  const sent = [];
  let client;

  jest.isolateModules(() => {
    Object.assign(process.env, { GEMINI_API_KEY: "test-key", ...env });
    jest.doMock("../models/AiCall", () => ({ aggregate: async () => [], create: async () => ({}) }));
    jest.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async (request) => {
              sent.push(request);
              return { text: "{}", usageMetadata: {} };
            },
          };
        }
      },
    }));
    client = require("../services/ai/client");
  });

  return { client, sent };
};

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});

describe("thinking level", () => {
  it("asks Gemini 3 models to think LOW, which is what keeps Ask inside its timeout", async () => {
    const { client, sent } = loadClient();
    await client.generate({ contents: "hi", feature: "test", cacheable: false });

    expect(sent[0].model).toMatch(/^gemini-3/);
    expect(sent[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("sends no thinking level to a 2.5 model, which would reject it on every call", async () => {
    const { client, sent } = loadClient({ GEMINI_MODEL: "gemini-2.5-flash" });
    await client.generate({ contents: "hi", feature: "test", cacheable: false });

    expect(sent[0].model).toBe("gemini-2.5-flash");
    expect(sent[0].config.thinkingConfig).toBeUndefined();
  });

  it("leaves a feature's own thinking setting alone", async () => {
    const { client, sent } = loadClient();
    await client.generate({
      contents: "hi",
      feature: "test",
      cacheable: false,
      config: { thinkingConfig: { thinkingLevel: "HIGH" } },
    });

    expect(sent[0].config.thinkingConfig).toEqual({ thinkingLevel: "HIGH" });
  });

  it("keeps the rest of the config intact", async () => {
    const { client, sent } = loadClient();
    await client.generate({
      contents: "hi",
      feature: "test",
      cacheable: false,
      config: { responseMimeType: "application/json", temperature: 0 },
    });

    expect(sent[0].config).toMatchObject({ responseMimeType: "application/json", temperature: 0 });
  });
});
