import Sidebar from "../sidebar";
import { layout } from "../../theme";

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: layout.desktopSidebarWidth,
          overflowY: "auto",
          marginTop: "var(--page-header-height, 0px)",
          height: "calc(100vh - var(--page-header-height, 0px))",
        }}
      >
        <div style={{ padding: `24px ${layout.desktopContentPaddingX}px 120px` }}>
          {children}
        </div>
      </main>
    </div>
  );
}
