import { NavLink } from "react-router-dom";
import { useAuth } from "../context/authContext";

/**
 * `roles` on a link is presentation only - it stops people being shown doors
 * that will 403 when they push them. Authorisation happens on the server, on
 * every request; see middlewares/permissions.js.
 */
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
      { to: "/suppliers", label: "Suppliers", roles: ["owner"] },
    ],
  },
  {
    title: "Operations",
    links: [
      { to: "/sales", label: "Sales" },
      { to: "/purchases", label: "Purchases", roles: ["owner"] },
      { to: "/scan-invoice", label: "Scan Invoice", roles: ["owner"] },
      { to: "/inventory", label: "Inventory", roles: ["owner"] },
      { to: "/movements", label: "Stock Movements" },
    ],
  },
  {
    title: "Intelligence",
    links: [
      // Available to both: the assistant's answers are scoped per role by the
      // tool layer rather than by hiding the page.
      { to: "/ask", label: "Ask" },
      { to: "/forecast", label: "Forecast", roles: ["owner"] },
      { to: "/reorder-plan", label: "Reorder Plan", roles: ["owner"] },
      { to: "/anomalies", label: "Anomaly Watch", roles: ["owner"] },
      { to: "/briefings", label: "Briefings", roles: ["owner"] },
    ],
  },
  {
    title: "Insights",
    links: [
      { to: "/analytics", label: "Analytics", roles: ["owner"] },
      { to: "/reports", label: "Reports", roles: ["owner"] },
    ],
  },
  {
    title: "Administration",
    links: [
      { to: "/staff", label: "Staff", roles: ["owner"] },
      { to: "/activity", label: "Activity Log", roles: ["owner"] },
    ],
  },
];

const Sidebar = ({ open, onNavigate }) => {
  const { user } = useAuth();

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      links: section.links.filter(
        (link) => !link.roles || link.roles.includes(user?.role)
      ),
    }))
    .filter((section) => section.links.length > 0);

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
          {visibleSections.map((section) => (
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
