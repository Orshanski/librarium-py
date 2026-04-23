import { useEffect, useMemo, useState } from "react";
import { colors, layout } from "../../theme";
import { SidebarContent } from "../sidebar";
import { MobileLayoutProvider } from "./layout-context";
import MobileTabBar from "./mobile-tab-bar";

export default function MobileShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const contextValue = useMemo(
    () => ({
      drawerOpen,
      toggleDrawer: () => setDrawerOpen((open) => !open),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [drawerOpen],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <MobileLayoutProvider value={contextValue}>
      <div style={{ minHeight: "100dvh", overflow: "hidden", backgroundColor: colors.bg }}>
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            zIndex: 60,
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        />
        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: "min(84vw, 320px)",
            paddingTop: "var(--sat)",
            paddingBottom: "var(--sab)",
            paddingLeft: "var(--sal)",
            backgroundColor: colors.sidebar,
            borderRight: `1px solid ${colors.border}`,
            zIndex: 61,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.2s ease",
          }}
        >
          <SidebarContent mobile onNavigate={() => setDrawerOpen(false)} />
        </aside>

        <main
          style={{
            overflowY: "auto",
            marginTop: "var(--page-header-height, 0px)",
            height: `calc(100dvh - var(--page-header-height, 0px) - ${layout.mobileBottomBarHeight}px - var(--sab))`,
          }}
        >
          <div style={{ padding: `${layout.mobileContentPaddingX}px ${layout.mobileContentPaddingX}px ${layout.mobileContentPaddingX + 12}px` }}>
            {children}
          </div>
        </main>

        <MobileTabBar />
      </div>
    </MobileLayoutProvider>
  );
}
