/**
 * Run the whole suite in a timezone that is NOT UTC.
 *
 * Date handling bugs of the form "setHours is local, toISOString is UTC" are
 * invisible on a UTC machine and wrong everywhere else - they pass in CI and
 * fail on the developer's laptop, which is the worst way for a bug to behave.
 * Exactly that slipped through the forecasting date handling once.
 *
 * Pinning to a half-hour offset is deliberate: +05:30 catches both the
 * whole-hour mistakes and the rarer ones that only appear when the offset is
 * not a round number of hours. Node reads TZ when the first Date is
 * constructed, so this must run before anything else - which is why it lives at
 * the top of setupFiles rather than in a beforeAll.
 */
process.env.TZ = process.env.TZ || "Asia/Kolkata";

jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = {
          generateContent: async () => ({
            text: JSON.stringify({ recommendations: [] })
          })
        };
      }
    }
  };
});
