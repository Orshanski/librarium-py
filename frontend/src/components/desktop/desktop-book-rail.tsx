export default function DesktopBookRail({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "150px",
        gap: 24,
        overflowX: "auto",
        paddingBottom: 8,
        justifyContent: "start",
      }}
    >
      {children}
    </div>
  );
}
