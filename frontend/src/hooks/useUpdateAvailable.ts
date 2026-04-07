import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    __BUILD_VERSION__?: string;
  }
}

export function useUpdateAvailable(): [boolean, () => void] {
  const [available, setAvailable] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const buildVersion = window.__BUILD_VERSION__;
    if (!buildVersion) return;

    fetch("/version.txt", { cache: "no-store" })
      .then((r) => r.ok ? r.text() : null)
      .then((serverVersion) => {
        if (!serverVersion) return;
        if (serverVersion.trim() !== buildVersion) {
          setAvailable(true);
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const reload = () => {
    window.location.reload();
  };

  return [available, reload];
}
