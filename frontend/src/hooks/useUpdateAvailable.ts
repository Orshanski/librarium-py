import { useState, useEffect } from "react";

const APP_VERSION = __APP_VERSION__;

export function useUpdateAvailable(): [boolean, () => void] {
  const key = "librarium_app_version";

  const [available, setAvailable] = useState(() => {
    const stored = localStorage.getItem(key);
    if (!stored) {
      localStorage.setItem(key, APP_VERSION);
      return false;
    }
    return stored !== APP_VERSION;
  });

  // SW sends postMessage after activation — reliable even if React mounts late
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATED") setAvailable(true);
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const reload = () => {
    localStorage.setItem(key, APP_VERSION);
    window.location.reload();
  };

  return [available, reload];
}
