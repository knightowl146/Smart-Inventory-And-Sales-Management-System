import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/authContext";
import Spinner from "./Spinner";

/**
 * Gate for every route that is not the login page.
 *
 * The "loading" branch matters: on a reload the app spends a moment exchanging
 * the refresh cookie for an access token, and redirecting during that window
 * would bounce a signed-in user to the login screen on every refresh.
 */
const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="auth-splash">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

export default RequireAuth;
