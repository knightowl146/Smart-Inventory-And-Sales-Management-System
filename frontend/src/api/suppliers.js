import apiClient from "./client";

export const getSuppliers = (params) => apiClient.get("/suppliers", { params });
export const getSupplierById = (id) => apiClient.get(`/suppliers/${id}`);
export const createSupplier = (data) => apiClient.post("/suppliers", data);
export const updateSupplier = (id, data) => apiClient.put(`/suppliers/${id}`, data);
export const deleteSupplier = (id) => apiClient.delete(`/suppliers/${id}`);