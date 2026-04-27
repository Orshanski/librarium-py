import { colors } from "../theme";

interface CoverRatingStarsTokens {
  top: number;
  right: number;
  fontSize: number;
  letterSpacing?: number;
}

interface CoverRatingStarsProps {
  rating: number;
  tokens: CoverRatingStarsTokens;
}

export default function CoverRatingStars({ rating, tokens }: Readonly<CoverRatingStarsProps>) {
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
      {"★".repeat(rating)}
    </div>
  );
}
