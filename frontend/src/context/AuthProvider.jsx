import { useCallback, useEffect, useMemo, useState } from "react";
import {
  refreshAccessToken,
  setAccessToken,
  setAuthFailureHandler,
} from "../api/client";
import * as authApi from "../api/auth";
import { AuthContext } from "./authContext";

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
   */
  useEffect(() => {
    let cancelled = false;

    refreshAccessToken()
      .then((data) => {
        if (cancelled) return;
        setUser(data?.user ?? null);
        setStatus(data?.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });

    return () => {
      cancelled = true;
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

