export default function DesktopBookGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, 150px)",
        gap: 24,
      }}
    >
      {children}
    </div>
  );
}
