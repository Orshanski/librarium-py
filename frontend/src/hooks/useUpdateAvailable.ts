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

  // SW updated while app is running — new version available without restart
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    const handler = () => {
      if (hadController) setAvailable(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", handler);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handler);
  }, []);

  const reload = () => {
    localStorage.setItem(key, APP_VERSION);
    window.location.reload();
  };

  return [available, reload];
}
