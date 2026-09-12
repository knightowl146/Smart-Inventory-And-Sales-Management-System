import apiClient from "./client";

export const getCustomers = (params) => apiClient.get("/customers", { params });
export const getCustomerById = (id) => apiClient.get(`/customers/${id}`);
export const createCustomer = (data) => apiClient.post("/customers", data);
export const updateCustomer = (id, data) => apiClient.patch(`/customers/${id}`, data);
export const deleteCustomer = (id) => apiClient.delete(`/customers/${id}`);