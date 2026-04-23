import { colors } from "../theme";

export interface SortOption {
  key: string;
  label: string;
}

export default function SortSelect({
  options,
  value,
  onChange,
}: Readonly<{
  options: SortOption[];
  value: string;
  onChange: (key: string) => void;
}>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 30,
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: "0 24px 0 12px",
        fontSize: 13,
        color: colors.textSecondary,
        fontFamily: "inherit",
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
        paddingRight: 24,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key} style={{ backgroundColor: "#16162a", color: "#ccc" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
