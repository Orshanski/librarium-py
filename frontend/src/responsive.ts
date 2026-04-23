import { createContext, createElement, ReactNode, useContext, useEffect, useState } from "react";
import { layout } from "./theme";

const ResponsiveContext = createContext<boolean | null>(null);

function getMatches() {
  return globalThis.innerWidth < layout.mobileBreakpoint;
}

function useResponsiveValue() {
  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    const media = globalThis.matchMedia(`(max-width: ${layout.mobileBreakpoint - 1}px)`);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function ResponsiveProvider({ children }: { children: ReactNode }) {
  const isMobile = useResponsiveValue();

  return createElement(ResponsiveContext.Provider, { value: isMobile }, children);
}

export function useIsMobile() {
  const contextValue = useContext(ResponsiveContext);
  if (contextValue === null) {
    throw new Error("useIsMobile must be used within ResponsiveProvider");
  }
  return contextValue;
}
