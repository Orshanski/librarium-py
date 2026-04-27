import { colors } from "../theme";

interface CoverProgressBarProps {
  progressPercent: number;
}

export default function CoverProgressBar({ progressPercent }: Readonly<CoverProgressBarProps>) {
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
          width: `${progressPercent}%`,
          backgroundColor: colors.accent,
          transition: "width 0.2s",
        }}
      />
    </div>
  );
}
