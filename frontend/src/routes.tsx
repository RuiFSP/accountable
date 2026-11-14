import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import Contacts from "./pages/Contacts";
import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import Organizations from "./pages/Organizations";
import Pipeline from "./pages/Pipeline";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/pipeline", label: "Pipeline" },
];

export function AppRoutes() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">Accountable</div>
        <nav className="app-nav">
          {sections.map(({ path, label }) => (
            <NavLink key={path} to={path} end={path === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
