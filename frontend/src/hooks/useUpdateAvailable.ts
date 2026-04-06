import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const VERSION_KEY = "librarium_build_version";

export function useUpdateAvailable(): [boolean, () => void] {
  const [available, setAvailable] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetch("/version.txt", { cache: "no-store" })
      .then((r) => r.ok ? r.text() : null)
      .then((serverVersion) => {
        if (!serverVersion) return;
        const v = serverVersion.trim();
        const stored = localStorage.getItem(VERSION_KEY);
        if (!stored) {
          localStorage.setItem(VERSION_KEY, v);
        } else if (stored !== v) {
          setAvailable(true);
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const reload = () => {
    fetch("/version.txt", { cache: "no-store" })
      .then((r) => r.ok ? r.text() : null)
      .then((v) => {
        if (v) localStorage.setItem(VERSION_KEY, v.trim());
        window.location.reload();
      })
      .catch(() => window.location.reload());
  };

  return [available, reload];
}
