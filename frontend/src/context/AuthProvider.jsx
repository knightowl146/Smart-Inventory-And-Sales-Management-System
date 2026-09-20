import { useCallback, useEffect, useMemo, useState } from "react";
import {
  refreshAccessToken,
  setAccessToken,
  setAuthFailureHandler,
} from "../api/client";
import * as authApi from "../api/auth";
import { AuthContext } from "./authContext";

/**
 * How many times the boot-time refresh may be retried before giving up and
 * showing the login screen. Three attempts spread over about twelve seconds
 * covers a cold start on a sleeping free instance without leaving someone
 * staring at a spinner if the server is genuinely down.
 */
const BOOT_RETRIES = 3;

/**
 * Client-side view of who is signed in.
 *
 * Everything here is presentation. The server decides what a role may do on
 * every single request; hiding a nav link is a courtesy so people are not shown
 * buttons that would 403, never a security control.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  // The API client calls this when a refresh fails, so an expired session drops
  // the user to the login screen instead of leaving a dead-looking dashboard.
  useEffect(() => {
    setAuthFailureHandler(clearSession);
  }, [clearSession]);

  /**
   * On first load the access token is gone (it only ever lived in memory), but
   * the httpOnly refresh cookie may still be valid - so try to exchange it
   * before deciding the visitor is anonymous. This is what makes a page reload
   * keep you signed in.
   *
   * The retry matters more than it looks. Treating every failure as "not signed
   * in" conflates two very different things: the server saying no, and the
   * server not answering. On a free hosting tier the instance sleeps after a
   * quarter of an hour, and the first request to wake it takes the better part
   * of a minute - long enough for the proxy in front to give up and return a
   * gateway error. Reloading the page would then dump a perfectly valid session
   * at the login screen, and the user would sign in again, which works, because
   * by then the server is awake. That is the bug reported as "it logs me out on
   * refresh".
   *
   * So: only a 401 or 403 means anonymous. Anything else - no response, a
   * timeout, a 5xx - is treated as "ask again shortly".
   */
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const statusOf = (error) => error?.status ?? error?.response?.status ?? 0;

    const attempt = (remaining) => {
      refreshAccessToken()
        .then((data) => {
          if (cancelled) return;
          setUser(data?.user ?? null);
          setStatus(data?.user ? "authenticated" : "anonymous");
        })
        .catch((error) => {
          if (cancelled) return;

          const code = statusOf(error);
          const serverSaidNo = code === 401 || code === 403;

          if (serverSaidNo || remaining === 0) {
            clearSession();
            return;
          }

          // Backs off, because a waking instance needs seconds, not
          // milliseconds, and hammering it does not make it faster.
          timer = setTimeout(() => attempt(remaining - 1), (BOOT_RETRIES - remaining + 1) * 2000);
        });
    };

    attempt(BOOT_RETRIES);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [clearSession]);

  const signIn = useCallback(async (email, password) => {
    const response = await authApi.login(email, password);
    const { accessToken, user: signedInUser } = response.data.data;

    setAccessToken(accessToken);
    setUser(signedInUser);
    setStatus("authenticated");

    return signedInUser;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      isOwner: user?.role === "owner",
      signIn,
      signOut,
    }),
    [user, status, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

