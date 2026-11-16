import { useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import { getTheme, toggleTheme, type Theme } from "./lib/theme";
import Contact from "./pages/Contact";
import Contacts from "./pages/Contacts";
import Dashboard from "./pages/Dashboard";
import Deal from "./pages/Deal";
import Deals from "./pages/Deals";
import Organization from "./pages/Organization";
import Organizations from "./pages/Organizations";
import Pipeline from "./pages/Pipeline";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/pipeline", label: "Pipeline" },
];

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label="Dark mode"
      className="btn theme-toggle"
      onClick={() => setThemeState(toggleTheme())}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}

export function AppRoutes() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-brand">
          Accountable
          <span className="brand-dot" aria-hidden="true" />
        </span>
        <nav className="topbar-nav">
          {sections.map(({ path, label }) => (
            <NavLink key={path} to={path} end={path === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-actions">
          <ThemeToggle />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/deals?new=1")}
          >
            New deal
          </button>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/organizations/:id" element={<Organization />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<Contact />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<Deal />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
