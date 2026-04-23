import { useState, useEffect } from "react";

function checkIsPwa(): boolean {
  if (globalThis.matchMedia("(display-mode: standalone)").matches) return true;
  const params = new URLSearchParams(globalThis.location.search);
  if (params.has("nopwa")) {
    try { sessionStorage.removeItem("librarium_pwa_debug"); } catch {}
    return false;
  }
  if (params.has("pwa")) {
    try { sessionStorage.setItem("librarium_pwa_debug", "1"); } catch {}
    params.delete("pwa");
    const qs = params.toString();
    const newUrl = globalThis.location.pathname + (qs ? `?${qs}` : "") + globalThis.location.hash;
    globalThis.history.replaceState(null, "", newUrl);
    return true;
  }
  try { return sessionStorage.getItem("librarium_pwa_debug") === "1"; } catch { return false; }
}

export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(checkIsPwa);

  useEffect(() => {
    const mq = globalThis.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsPwa(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isPwa;
}
