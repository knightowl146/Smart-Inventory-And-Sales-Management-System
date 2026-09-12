import apiClient from "./client";

const get = (path, params) => apiClient.get(`/reports${path}`, { params });

export const getSalesReport = (params) => get("/sales", params);
export const getPurchaseReport = (params) => get("/purchases", params);
export const getInventoryReport = (params) => get("/inventory", params);
export const getProfitLossReport = (params) => get("/profit-loss", params);
export const getSupplierReport = (params) => get("/suppliers", params);
export const getCustomerReport = (params) => get("/customers", params);

// Exports return raw files (blob) rather than JSON.
const getExport = (path, params) =>
  apiClient.get(`/reports${path}`, { params, responseType: "blob" });

export const exportSalesReport = (params) => getExport("/sales/export", params);
export const exportPurchaseReport = (params) => getExport("/purchases/export", params);
export const exportInventoryReport = (params) => getExport("/inventory/export", params);
export const exportProfitLossReport = (params) => getExport("/profit-loss/export", params);

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Delay revoking the object URL — revoking it in the same tick as click()
  // can race with the browser actually starting the download, causing it
  // to fail silently with no file ever written to disk.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};