import axios from "axios";

/**
 * Default to the same-origin /api path. Vite proxies it in development and
 * Vercel rewrites it in production, so the browser only ever talks to one
 * origin - which is what lets the refresh cookie stay a first-party,
 * SameSite=Lax cookie instead of a third-party one Safari would drop.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  // Needed for the httpOnly refresh cookie on the /auth calls.
  withCredentials: true,
});

/**
 * The access token lives here, in a module variable, and nowhere else.
 *
 * Not localStorage, not sessionStorage: anything readable from JavaScript is
 * readable by an XSS payload, and a token that survives a page reload survives
 * long enough to be exfiltrated and reused. Keeping it in memory means the
 * worst case is a token that dies when the tab closes - and the httpOnly
 * refresh cookie silently gets a new one on the next load.
 */
let accessToken = null;
let onAuthFailure = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const setAuthFailureHandler = (handler) => {
  onAuthFailure = handler;
};

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * A bare instance for the refresh call itself. If it went through apiClient a
 * failing refresh would hit the 401 interceptor below and try to refresh again,
 * forever.
 */
const refreshClient = axios.create({ baseURL, withCredentials: true });

let inFlightRefresh = null;

/**
 * Single-flight: a dashboard fires a dozen requests at once, so when the access
 * token expires a dozen of them 401 together. Without this they would each post
 * their own refresh, and since refresh tokens rotate, the second one to arrive
 * would look like a replay and revoke every session.
 */
export const refreshAccessToken = () => {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshClient
      .post("/auth/refresh")
      .then((response) => {
        const data = response.data?.data;
        accessToken = data?.accessToken ?? null;
        return data;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }

  return inFlightRefresh;
};

const normaliseError = (error) => ({
  status: error.response?.status || 0,
  message:
    error.response?.data?.message ||
    error.message ||
    "Something went wrong. Please try again.",
  original: error,
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const status = error.response?.status;

    // One silent retry per request. Auth endpoints are excluded so a failed
    // login does not trigger a refresh attempt.
    const isRetryable =
      status === 401 &&
      request &&
      !request._hasRetried &&
      !String(request.url || "").startsWith("/auth/");

    if (isRetryable) {
      request._hasRetried = true;

      try {
        await refreshAccessToken();
        return await apiClient(request);
      } catch {
        accessToken = null;
        onAuthFailure();
      }
    }

    return Promise.reject(normaliseError(error));
  }
);

export default apiClient;
