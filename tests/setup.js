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
