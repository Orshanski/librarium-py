import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ResponsiveProvider } from "./responsive";
import { installFetchCredentials } from "./api";
import { evictExpired, getUnsyncedProgress, getUnsyncedSettings, markProgressSynced, markSettingsSynced } from "./utils/offline-storage";
import { getDeviceName } from "./utils/device-info";
import App from "./App";

installFetchCredentials();

// Evict expired cached books on startup (14-day TTL)
evictExpired().catch((err) => console.warn("Failed to evict expired books:", err));

// Sync unsynced reading progress and settings when coming back online
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
          last_device: getDeviceName(),
          last_format: p.lastFormat,
          fraction: p.fraction,
        }),
      });
      await markProgressSynced(p.bookId);
    }
  } catch (err) {
    console.warn("Failed to sync progress on reconnect:", err);
  }

  try {
    const unsyncedSettings = await getUnsyncedSettings();
    for (const s of unsyncedSettings) {
      await fetch("/api/reader/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: s.settings }),
      });
      await markSettingsSynced(s.deviceType);
    }
  } catch (err) {
    console.warn("Failed to sync settings on reconnect:", err);
  }
});

// Evict expired books when going offline to free space
window.addEventListener("offline", () => {
  evictExpired().catch((err) => console.warn("Failed to evict expired books on offline:", err));
});

// Register Service Worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW registration failed:", err));
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
