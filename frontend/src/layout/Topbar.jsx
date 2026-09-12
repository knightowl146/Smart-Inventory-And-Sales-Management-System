import { useLocation } from "react-router-dom";

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
  "/recommendations": "AI Recommendations",
  "/reports": "Reports",
};

const Topbar = ({ onMenuClick }) => {
  const location = useLocation();
  const title = titleMap[location.pathname] || "Smart Inventory";

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
      </div>
    </header>
  );
};

export default Topbar;