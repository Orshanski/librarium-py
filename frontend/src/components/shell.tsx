import Sidebar from "./sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: 220,
          overflowY: "auto",
          marginTop: "var(--page-header-height, 0px)",
          height: "calc(100vh - var(--page-header-height, 0px))",
        }}
      >
        <div style={{ padding: "24px 32px 120px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
