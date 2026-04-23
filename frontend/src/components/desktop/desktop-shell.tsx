import Sidebar from "../sidebar";
import { layout } from "../../theme";

export default function DesktopShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: layout.desktopSidebarWidth,
          overflowY: "auto",
          marginTop: "var(--page-header-height, 0px)",
          height: "calc(100dvh - var(--page-header-height, 0px))",
        }}
      >
        <div style={{ padding: `24px ${layout.desktopContentPaddingX}px 120px` }}>
          {children}
        </div>
      </main>
    </div>
  );
}
