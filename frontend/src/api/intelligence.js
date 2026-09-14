import apiClient from "./client";

// ── Forecasting and reorder (Phase 3) ───────────────────────────────────────

export const getProductForecast = (productId, params) =>
  apiClient.get(`/analytics/forecast/${productId}`, { params });

export const getReorderPlan = (params) => apiClient.get("/analytics/reorder-plan", { params });

export const getForecastAccuracy = () => apiClient.get("/analytics/forecast-accuracy");

// ── Anomalies (Phase 5) ─────────────────────────────────────────────────────

export const getAnomalies = (params) => apiClient.get("/analytics/anomalies", { params });

// ── Assistant (Phase 4) ─────────────────────────────────────────────────────

export const askAssistant = (question) => apiClient.post("/ai/ask", { question });

export const getAiStatus = () => apiClient.get("/ai/status");

export const getAiUsage = () => apiClient.get("/ai/usage");

// ── Briefings (Phase 5) ─────────────────────────────────────────────────────

export const getBriefings = (params) => apiClient.get("/ai/briefings", { params });

export const generateBriefing = (days = 7) => apiClient.post("/ai/briefings", { days });

// ── Receipts (Tier 2) ───────────────────────────────────────────────────────

/**
 * Fetched as a blob rather than linked to directly: the endpoint needs the
 * Authorization header, and a plain <a href> cannot carry one.
 */
export const fetchReceipt = (movementId) =>
  apiClient.get(`/movements/${movementId}/receipt`, { responseType: "blob" });
