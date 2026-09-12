import apiClient from "./client";

export const getProducts = (params) => apiClient.get("/products", { params });
export const getProductById = (id) => apiClient.get(`/products/${id}`);
export const createProduct = (data) => apiClient.post("/products", data);
export const updateProduct = (id, data) => apiClient.patch(`/products/${id}`, data);
export const deleteProduct = (id) => apiClient.delete(`/products/${id}`);
export const purchaseProduct = (id, data) => apiClient.post(`/products/${id}/purchase`, data);
export const sellProduct = (id, data) => apiClient.post(`/products/${id}/sell`, data);