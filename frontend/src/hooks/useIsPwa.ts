import { useState, useEffect } from "react";

function checkIsPwa(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (new URLSearchParams(window.location.search).has("pwa")) {
    try { localStorage.setItem("librarium_pwa_debug", "1"); } catch {}
    return true;
  }
  try { return localStorage.getItem("librarium_pwa_debug") === "1"; } catch { return false; }
}

export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(checkIsPwa);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsPwa(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isPwa;
}
