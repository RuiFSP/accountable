import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { path: "quotes", label: "Quotes" },
  { path: "invoices", label: "Invoices" },
  { path: "bills", label: "Bills" },
];

/**
 * The home for quotes, invoices and bills. Each tab's page is filled by its
 * own change; until then it says what is coming next.
 */
export default function Money() {
  return (
    <div>
      <div className="page-title">
        <h1>Money</h1>
        <span className="page-subtitle">Quotes, invoices and bills</span>
      </div>
      <nav className="tabs" aria-label="Money sections">
        {TABS.map(({ path, label }) => (
          <NavLink key={path} to={`/money/${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
