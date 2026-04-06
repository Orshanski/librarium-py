import { useState, useEffect } from "react";

export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsPwa(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isPwa;
}
