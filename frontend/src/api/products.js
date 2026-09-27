import apiClient from "./client";

export const getProducts = (params) => apiClient.get("/products", { params });
export const getProductById = (id) => apiClient.get(`/products/${id}`);
export const createProduct = (data) => apiClient.post("/products", data);
export const updateProduct = (id, data) => apiClient.patch(`/products/${id}`, data);
export const deleteProduct = (id) => apiClient.delete(`/products/${id}`);
export const purchaseProduct = (id, data) => apiClient.post(`/products/${id}/purchase`, data);
export const sellProduct = (id, data) => apiClient.post(`/products/${id}/sell`, data);

/**
 * Every product, however many pages that takes.
 *
 * The products endpoint caps a page at 100. Pickers used to ask for one page -
 * the Scan Invoice page asked for 200, got a 400 back, swallowed it, and showed
 * every line as "Not in the catalogue" while quietly keeping the real match
 * behind the dropdown. The others asked for exactly 100, which works until the
 * shop stocks its 101st product and that one silently disappears from the list.
 * A dropdown of products must contain all of them.
 */
export const getAllProducts = async (params = {}) => {
  const PAGE_SIZE = 100; // the API's maximum
  const MAX_PAGES = 50; // a backstop, not a limit anyone should reach
  const all = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await getProducts({ ...params, page, limit: PAGE_SIZE });
    all.push(...(response.data.data ?? []));

    if (page >= (response.data.pagination?.totalPages ?? 1)) break;
  }

  return all;
};
