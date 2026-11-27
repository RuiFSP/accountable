import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import { type Deal, type Organization } from "./api/client";
import { type RecordPanel } from "./components/RecordPanels";
import { SignedIn } from "./components/SignIn";
import SearchBox from "./components/SearchBox";
import UserMenu from "./components/UserMenu";
import Contact from "./pages/Contact";
import Contacts from "./pages/Contacts";
import Dashboard from "./pages/Dashboard";
import DealPage from "./pages/Deal";
import Deals from "./pages/Deals";
import Money from "./pages/Money";
import OrganizationPage from "./pages/Organization";
import Organizations from "./pages/Organizations";
import Pipeline from "./pages/Pipeline";
import Products from "./pages/Products";
import Settings from "./pages/Settings";
import BillsTab from "./pages/money/BillsTab";
import InvoicesTab from "./pages/money/InvoicesTab";
import OrganizationBills from "./pages/money/OrganizationBills";
import QuotesTab from "./pages/money/QuotesTab";

export const SECTIONS = [
  { path: "/", label: "Dashboard" },
  { path: "/organizations", label: "Organizations" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/products", label: "Products" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/money", label: "Money" },
];

// The panels the quotes, invoices and bills changes add to the CRM's pages.
// Each area adds its own entry when it lands.
const DEAL_PANELS: RecordPanel<Deal>[] = [];
const ORGANIZATION_PANELS: RecordPanel<Organization>[] = [
  { name: "bills", Panel: OrganizationBills },
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
            {SECTIONS.map(({ path, label }) => (
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
            <Route
              path="/organizations/:id"
              element={<OrganizationPage panels={ORGANIZATION_PANELS} />}
            />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<Contact />} />
            <Route path="/deals" element={<Deals />} />
            <Route
              path="/deals/:id"
              element={<DealPage panels={DEAL_PANELS} />}
            />
            <Route path="/products" element={<Products />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/money" element={<Money />}>
              <Route index element={<Navigate to="quotes" replace />} />
              <Route path="quotes/*" element={<QuotesTab />} />
              <Route path="invoices/*" element={<InvoicesTab />} />
              <Route path="bills/*" element={<BillsTab />} />
              <Route
                path="*"
                element={<Navigate to="/money/quotes" replace />}
              />
            </Route>
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </SignedIn>
  );
}
