import { colors } from "../../theme";

// ─── Password match indicator ────────────────────────
export default function PasswordMatch({ pass, confirm }: Readonly<{ pass: string; confirm: string }>) {
  if (!pass && !confirm) return <div style={{ height: 14 }} />;
  if (confirm.length === 0) return <div style={{ height: 14 }} />;
  const match = pass === confirm;
  return (
    <div style={{ fontSize: 11, marginTop: 4, height: 14, color: match ? colors.success : colors.danger }}>
      {match ? "Пароли совпадают" : "Пароли не совпадают"}
    </div>
  );
}
