import apiClient from "./client";

export const getMovements = (params) => apiClient.get("/movements", { params });
export const getMovementsByProduct = (productId, params) =>
  apiClient.get(`/movements/product/${productId}`, { params });
export const getLowStockMovements = (params) => apiClient.get("/movements/low-stock", { params });