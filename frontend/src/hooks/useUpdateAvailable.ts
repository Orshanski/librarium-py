import { useState, useEffect } from "react";

export function useUpdateAvailable(): [boolean, () => void] {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const handler = () => setAvailable(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  const reload = () => window.location.reload();

  return [available, reload];
}
