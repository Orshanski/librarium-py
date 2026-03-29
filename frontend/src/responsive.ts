import { useEffect, useState } from "react";
import { layout } from "./theme";

export function useIsMobile() {
  const getMatches = () => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < layout.mobileBreakpoint;
  };

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${layout.mobileBreakpoint - 1}px)`);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}
