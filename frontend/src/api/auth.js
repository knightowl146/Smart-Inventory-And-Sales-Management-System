import apiClient from "./client";

export const login = (email, password) =>
  apiClient.post("/auth/login", { email, password });

export const logout = () => apiClient.post("/auth/logout");

export const logoutEverywhere = () => apiClient.post("/auth/logout-all");

export const getMe = () => apiClient.get("/auth/me");

export const changePassword = (currentPassword, newPassword) =>
  apiClient.post("/auth/change-password", { currentPassword, newPassword });

export const getMySummary = () => apiClient.get("/me/summary");
