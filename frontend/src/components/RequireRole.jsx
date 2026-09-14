import { Outlet } from "react-router-dom";
import { useAuth } from "../context/authContext";

/**
 * Shows a clear "not your page" panel rather than redirecting.
 *
 * A silent redirect to the dashboard makes an employee think the app is broken;
 * saying plainly that the page is owner-only is both honest and less
 * support-generating. The API returns 403 for these routes regardless of what
 * this component does.
 */
const RequireRole = ({ role, children }) => {
  const { user } = useAuth();
  const allowed = Array.isArray(role) ? role : [role];

  if (!user || !allowed.includes(user.role)) {
    return (
      <div className="panel forbidden">
        <h2 className="panel__title">Owner access only</h2>
        <p>
          This page is restricted to owner accounts. You are signed in as{" "}
          <strong>{user?.name}</strong> ({user?.role}).
        </p>
        <p className="field-hint">
          If you need access, ask an owner to change your role from the Staff page.
        </p>
      </div>
    );
  }

  return children ?? <Outlet />;
};

export default RequireRole;
