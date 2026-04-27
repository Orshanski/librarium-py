import { colors } from "../theme";

interface CoverRatingChipTokens {
  top: number | string;
  right: number | string;
  padding: string;
  fontSize: number;
  iconFontSize: number;
  gap?: number;
}

interface CoverRatingChipProps {
  rating: number;
  tokens: CoverRatingChipTokens;
}

export default function CoverRatingChip({ rating, tokens }: Readonly<CoverRatingChipProps>) {
  return (
    <div
      style={{
        position: "absolute",
        top: tokens.top,
        right: tokens.right,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        borderRadius: 4,
        padding: tokens.padding,
        fontSize: tokens.fontSize,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: tokens.gap ?? 3,
      }}
    >
      <span style={{ color: colors.accent, fontSize: tokens.iconFontSize }}>★</span>
      {rating}
    </div>
  );
}
