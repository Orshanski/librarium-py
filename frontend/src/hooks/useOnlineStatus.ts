import { useState, useEffect } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("offline", onOffline);
    return () => {
      globalThis.removeEventListener("online", onOnline);
      globalThis.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
