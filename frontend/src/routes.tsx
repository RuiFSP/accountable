import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import { SignedIn } from "./components/SignIn";
import SearchBox from "./components/SearchBox";
import UserMenu from "./components/UserMenu";
import Contact from "./pages/Contact";
import Contacts from "./pages/Contacts";
import Dashboard from "./pages/Dashboard";
import Deal from "./pages/Deal";
import Deals from "./pages/Deals";
import Organization from "./pages/Organization";
import Organizations from "./pages/Organizations";
import Pipeline from "./pages/Pipeline";
import Products from "./pages/Products";

const sections = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/products", label: "Products" },
  { path: "/pipeline", label: "Pipeline" },
];

export function AppRoutes() {
  const navigate = useNavigate();

  return (
    <SignedIn>
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
          <SearchBox />
          <div className="topbar-actions">
            <UserMenu />
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
            <Route path="/products" element={<Products />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </SignedIn>
  );
}
