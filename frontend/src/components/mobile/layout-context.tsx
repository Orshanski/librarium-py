import { createContext, useContext } from "react";

interface MobileLayoutContextValue {
  drawerOpen: boolean;
  toggleDrawer: () => void;
  closeDrawer: () => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextValue>({
  drawerOpen: false,
  toggleDrawer: () => {},
  closeDrawer: () => {},
});

export function MobileLayoutProvider({
  value,
  children,
}: {
  value: MobileLayoutContextValue;
  children: React.ReactNode;
}) {
  return <MobileLayoutContext.Provider value={value}>{children}</MobileLayoutContext.Provider>;
}

export function useMobileLayout() {
  return useContext(MobileLayoutContext);
}
