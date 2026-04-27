import { colors } from "../theme";

interface CoverRatingStarsTokens {
  top: number | string;
  right: number | string;
  fontSize: number;
  letterSpacing?: number;
}

interface CoverRatingStarsProps {
  rating: number;
  tokens: CoverRatingStarsTokens;
}

export default function CoverRatingStars({ rating, tokens }: Readonly<CoverRatingStarsProps>) {
  const safeRating = Math.max(0, Math.floor(rating));
  return (
    <div
      style={{
        position: "absolute",
        top: tokens.top,
        right: tokens.right,
        color: colors.accent,
        fontSize: tokens.fontSize,
        letterSpacing: tokens.letterSpacing,
      }}
    >
      {"★".repeat(safeRating)}
    </div>
  );
}
