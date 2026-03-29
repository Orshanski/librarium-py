export default function MobileBookGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
        alignItems: "start",
      }}
    >
      {children}
    </div>
  );
}
