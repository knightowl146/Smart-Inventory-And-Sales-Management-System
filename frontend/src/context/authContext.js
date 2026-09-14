import { createContext, useContext } from "react";

/**
 * The context object and its hook live in a plain .js module, separate from the
 * provider component, so the provider file exports nothing but a component.
 * React Fast Refresh can only hot-reload a module whose exports are all
 * components; mixing a hook in with the provider silently breaks refresh for
 * the whole tree (and trips react-refresh/only-export-components).
 */
export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
};
