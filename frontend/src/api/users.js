import apiClient from "./client";

export const getUsers = () => apiClient.get("/users");

export const createUser = (data) => apiClient.post("/users", data);

export const updateUser = (id, data) => apiClient.patch(`/users/${id}`, data);

export const resetUserPassword = (id, newPassword) =>
  apiClient.post(`/users/${id}/password`, { newPassword });

export const deleteUser = (id) => apiClient.delete(`/users/${id}`);

export const getAuditLog = (params) => apiClient.get("/audit", { params });
