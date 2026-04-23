import { colors } from "../theme";

interface ReaderErrorScreenProps {
  error: string | null;
  onBack: () => void;
}

export default function ReaderErrorScreen({ error, onBack }: Readonly<ReaderErrorScreenProps>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.danger, gap: 16 }}>
      <div>{error || "Не удалось загрузить книгу"}</div>
      <button onClick={onBack} style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
        Назад
      </button>
    </div>
  );
}
