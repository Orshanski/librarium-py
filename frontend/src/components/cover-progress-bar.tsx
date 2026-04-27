import { colors } from "../theme";

interface CoverProgressBarProps {
  progressPercent: number;
}

export default function CoverProgressBar({ progressPercent }: Readonly<CoverProgressBarProps>) {
  const clamped = Math.max(0, Math.min(100, progressPercent));
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${clamped}%`,
          backgroundColor: colors.accent,
          transition: "width 0.2s",
        }}
      />
    </div>
  );
}
