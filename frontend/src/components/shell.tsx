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
          height: "100vh",
        }}
      >
        <div style={{ padding: "140px 32px 120px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
