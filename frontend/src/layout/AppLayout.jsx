import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useAuth } from "../context/authContext";

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { isDemo } = useAuth();

  // Close the mobile nav drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting transient UI (drawer open/closed) on navigation, not derived data
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className="app-shell__main">
        <Topbar onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="app-shell__content">
          {isDemo && (
            <p className="demo-banner" role="status">
              <strong>Read-only demo.</strong> Everything you see is live data, and nothing you do can
              change it: saving, recording and deleting are switched off. Ask and Scan Invoice work,
              with a daily limit.
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;