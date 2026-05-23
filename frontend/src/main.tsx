import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ResponsiveProvider } from "./responsive";
import { installFetchCredentials } from "./api/credentials";
import { installMetadataCacheHandlersForApp } from "./cache/bootstrap";
import { installScrollInvalidationHandlersForApp } from "./scroll/bootstrap";
import { installOfflineStorageHandlersForApp } from "./offline/bootstrap";
import { installAppLifecycleForApp } from "./lifecycle/bootstrap";
import App from "./App";

installFetchCredentials();
installMetadataCacheHandlersForApp();
installScrollInvalidationHandlersForApp();
installOfflineStorageHandlersForApp();
installAppLifecycleForApp();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <ResponsiveProvider>
        <App />
      </ResponsiveProvider>
    </AuthProvider>
  </BrowserRouter>
);
