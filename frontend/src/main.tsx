import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AppRoutes } from "./routes";
import "./styles/brand.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);
