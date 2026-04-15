import { colors } from "../theme";

interface ReaderLoadingScreenProps {
  loadProgress: number;
}

export default function ReaderLoadingScreen({ loadProgress }: ReaderLoadingScreenProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim, gap: 16 }}>
      <div>Загрузка книги...{loadProgress > 0 ? ` ${loadProgress}%` : loadProgress < 0 ? ` ${(-loadProgress / 1048576).toFixed(1)} МБ` : ""}</div>
      <div style={{ width: 200, height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
        <div style={{ width: loadProgress > 0 ? `${loadProgress}%` : "0%", height: "100%", backgroundColor: colors.accent, borderRadius: 2, transition: "width 0.2s" }} />
      </div>
    </div>
  );
}
