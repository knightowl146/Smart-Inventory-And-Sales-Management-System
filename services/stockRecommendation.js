const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


const generateStockRecommendations = async (metrics) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",

    contents: `
You are an inventory management AI.

Analyze the provided inventory and sales metrics.

For every product:
- Determine the stock recommendation.
- Give a short explanation.

The backend has already calculated:
- averageDailySales
- salesGrowth
- daysOfStockRemaining
- baseReorderQuantity

Use these calculations as the source of truth.

Consider:
- currentStock
- lowStockThreshold
- salesLast7Days
- salesLast30Days
- salesPrevious30Days
- averageDailySales
- salesGrowth
- daysOfStockRemaining
- baseReorderQuantity

Rules:
- If salesLast30Days is 0:
  recommendation = NO_SALES

- If currentStock is 0 and there is historical demand:
  recommendation = REORDER_NOW

- If currentStock is at or below lowStockThreshold:
  recommendation = REORDER_NOW

- If daysOfStockRemaining is 7 or less:
  recommendation = REORDER_SOON

- Otherwise:
  recommendation = HEALTHY

Do not invent any data.

The backend will calculate the final recommended quantity.
Do not attempt to override the backend quantity.

Products:

${JSON.stringify(metrics)}
`,

    config: {
      responseMimeType: "application/json",

      responseSchema: {
        type: "object",

        properties: {
          recommendations: {
            type: "array",

            items: {
              type: "object",

              properties: {
                productId: {
                  type: "string"
                },

                recommendation: {
                  type: "string",
                  enum: [
                    "REORDER_NOW",
                    "REORDER_SOON",
                    "HEALTHY",
                    "NO_SALES"
                  ]
                },

                reason: {
                  type: "string"
                }
              },

              required: [
                "productId",
                "recommendation",
                "reason"
              ]
            }
          }
        },

        required: [
          "recommendations"
        ]
      }
    }
  });

  const text = response.text;

  if (!text) {
    throw new Error("Gemini returned an empty response (no text content)");
  }

  return JSON.parse(text);
};


const calculateBaseReorderQuantity = (product) => {
  if (product.salesLast30Days === 0) {
    return 0;
  }

  const targetDays = 30;

  const targetStock =
    product.averageDailySales * targetDays;

  const reorderQuantity =
    targetStock - product.currentStock;

  return Math.max(
    0,
    Math.ceil(reorderQuantity)
  );
};


const calculateRecommendedQuantity = (product, recommendation) => {
  if (product.salesLast30Days === 0) {
    return 0;
  }

  let quantity = product.baseReorderQuantity;

  /*
   * Adjust the base quantity according to demand growth.
   *
   * Strong growth     >= 25%  → +20%
   * Moderate growth   >= 10%  → +10%
   * Moderate decline  <= -10% → -10%
   * Strong decline    <= -25% → -20%
   *
   * The quantity is always based on backend-calculated
   * demand metrics and is never taken directly from Gemini.
   */

  if (product.salesGrowth >= 25) {
    quantity *= 1.20;
  } else if (product.salesGrowth >= 10) {
    quantity *= 1.10;
  } else if (product.salesGrowth <= -25) {
    quantity *= 0.80;
  } else if (product.salesGrowth <= -10) {
    quantity *= 0.90;
  }

  /*
   * Healthy products do not need a reorder.
   */
  if (recommendation === "HEALTHY") {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(quantity)
  );
};


const validateRecommendations = (
  metrics,
  recommendations
) => {
  const metricsMap = new Map(
    metrics.map((product) => [
      product.productId.toString(),
      product
    ])
  );

  return recommendations.map((recommendation) => {
    const product = metricsMap.get(
      recommendation.productId.toString()
    );

    if (!product) {
      return recommendation;
    }

    let finalRecommendation;

    /*
     * Backend remains the source of truth for
     * the actual recommendation status.
     */

    if (product.salesLast30Days === 0) {
      finalRecommendation = "NO_SALES";
    }

    else if (
      product.currentStock <=
      product.lowStockThreshold
    ) {
      finalRecommendation = "REORDER_NOW";
    }

    else if (
      product.daysOfStockRemaining !== null &&
      product.daysOfStockRemaining <= 7
    ) {
      finalRecommendation = "REORDER_SOON";
    }

    else {
      finalRecommendation = "HEALTHY";
    }

    /*
     * Calculate quantity deterministically.
     * Gemini's quantity is intentionally ignored.
     */
    const recommendedQuantity =
      calculateRecommendedQuantity(
        product,
        finalRecommendation
      );

    return {
      ...recommendation,

      recommendation: finalRecommendation,

      recommendedQuantity
    };
  });
};


module.exports = {
  generateStockRecommendations,
  calculateBaseReorderQuantity,
  calculateRecommendedQuantity,
  validateRecommendations
};