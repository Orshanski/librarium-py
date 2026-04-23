import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchStatic } from "@/api/client";

declare global {
  // eslint-disable-next-line no-var
  var __BUILD_VERSION__: string | undefined;
}

export function useUpdateAvailable(): [boolean, () => void] {
  const [available, setAvailable] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const buildVersion = globalThis.__BUILD_VERSION__;
    if (!buildVersion) return;

    fetchStatic("/version.txt", { cache: "no-store" })
      .then((serverVersion) => {
        if (serverVersion.trim() !== buildVersion) {
          setAvailable(true);
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const reload = () => {
    globalThis.location.reload();
  };

  return [available, reload];
}
