import { colors } from "../theme";

export interface LoadProgress {
  /** Percent of download (0..100). Zero means idle; negative means total is unknown — use `bytes`. */
  percent: number;
  /** Bytes received so far. Only meaningful display value when `percent <= 0`. */
  bytes: number;
}

interface ReaderLoadingScreenProps {
  loadProgress: LoadProgress;
}

export default function ReaderLoadingScreen({ loadProgress }: ReaderLoadingScreenProps) {
  const { percent, bytes } = loadProgress;
  const label =
    percent > 0
      ? ` ${percent}%`
      : percent < 0
        ? ` ${(bytes / 1048576).toFixed(1)} МБ`
        : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim, gap: 16 }}>
      <div>Загрузка книги...{label}</div>
      <div style={{ width: 200, height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
        <div style={{ width: percent > 0 ? `${percent}%` : "0%", height: "100%", backgroundColor: colors.accent, borderRadius: 2, transition: "width 0.2s" }} />
      </div>
    </div>
  );
}
