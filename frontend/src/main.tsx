import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import App from "./App";

// Global: all fetch requests include credentials (cookie auth)
const _fetch = window.fetch;
window.fetch = (input, init) => _fetch(input, { credentials: "include", ...init });

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
