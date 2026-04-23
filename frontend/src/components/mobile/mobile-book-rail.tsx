export default function MobileBookRail({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "calc((100% - 24px) / 3)",
        gap: 12,
        overflowX: "auto",
        paddingBottom: 8,
        justifyContent: "start",
      }}
    >
      {children}
    </div>
  );
}
