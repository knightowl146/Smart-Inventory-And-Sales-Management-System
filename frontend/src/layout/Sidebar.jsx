import { NavLink } from "react-router-dom";

const navSections = [
  {
    title: "Overview",
    links: [{ to: "/", label: "Dashboard", end: true }],
  },
  {
    title: "Catalog",
    links: [
      { to: "/products", label: "Products" },
      { to: "/customers", label: "Customers" },
      { to: "/suppliers", label: "Suppliers" },
    ],
  },
  {
    title: "Operations",
    links: [
      { to: "/sales", label: "Sales" },
      { to: "/purchases", label: "Purchases" },
      { to: "/inventory", label: "Inventory" },
      { to: "/movements", label: "Stock Movements" },
    ],
  },
  {
    title: "Insights",
    links: [
      { to: "/analytics", label: "Analytics" },
      { to: "/recommendations", label: "AI Recommendations" },
      { to: "/reports", label: "Reports" },
    ],
  },
];

const Sidebar = ({ open, onNavigate }) => {
  return (
    <>
      <aside
        className={`sidebar${open ? " sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar__brand">
          <span className="sidebar__brand-mark">SI</span>
          <span className="sidebar__brand-name">Smart Inventory</span>
        </div>

        <nav className="sidebar__nav">
          {navSections.map((section) => (
            <div className="sidebar__section" key={section.title}>
              <p className="sidebar__section-title">{section.title}</p>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    "sidebar__link" + (isActive ? " sidebar__link--active" : "")
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && (
        <div
          className="sidebar-backdrop sidebar-backdrop--visible"
          onClick={onNavigate}
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default Sidebar;