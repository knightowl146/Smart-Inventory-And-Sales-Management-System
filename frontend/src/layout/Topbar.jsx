import { useLocation } from "react-router-dom";
import { useAuth } from "../context/authContext";

const titleMap = {
  "/": "Dashboard",
  "/products": "Products",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/sales": "Sales",
  "/purchases": "Purchases",
  "/inventory": "Inventory",
  "/movements": "Stock Movements",
  "/analytics": "Analytics",
  "/reports": "Reports",
  "/staff": "Staff",
  "/activity": "Activity Log",
  "/ask": "Ask Your Inventory",
  "/forecast": "Demand Forecast",
  "/reorder-plan": "Reorder Plan",
  "/anomalies": "Anomaly Watch",
  "/briefings": "Business Briefings",
  "/scan-invoice": "Scan Invoice",
};

const Topbar = ({ onMenuClick }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const title =
    location.pathname === "/" && user?.role === "employee"
      ? "My Day"
      : titleMap[location.pathname] || "Smart Inventory";

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <button
          type="button"
          className="topbar__menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="topbar__title">{title}</h1>

        {user && (
          <div className="topbar__user">
            <span className="topbar__user-name">{user.name}</span>
            <span className={`role-pill role-pill--${user.role}`}>{user.role}</span>
            <button type="button" className="btn btn--secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
