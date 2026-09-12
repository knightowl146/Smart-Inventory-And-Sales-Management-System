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

const Topbar = () => {
  const location = useLocation();
  const title = titleMap[location.pathname] || "Smart Inventory";

  return (
    <header className="topbar">
      <h1 className="topbar__title">{title}</h1>
    </header>
  );
};

export default Topbar;