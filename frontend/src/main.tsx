import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ResponsiveProvider } from "./responsive";
import { installFetchCredentials } from "./api";
import { evictExpired, getUnsyncedProgress, markProgressSynced } from "./utils/offline-storage";
import App from "./App";

installFetchCredentials();

// Evict expired cached books on startup (14-day TTL)
evictExpired().catch(() => {});

// Sync unsynced reading progress when coming back online
window.addEventListener("online", async () => {
  try {
    const unsynced = await getUnsyncedProgress();
    for (const p of unsynced) {
      await fetch(`/api/reader/progress/${p.bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          position: p.position,
          last_device: "",
          last_format: p.lastFormat,
          fraction: p.fraction,
        }),
      });
      await markProgressSynced(p.bookId);
    }
  } catch {}
});

// Register Service Worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <ResponsiveProvider>
        <App />
      </ResponsiveProvider>
    </AuthProvider>
  </BrowserRouter>
);
