import { useState } from "react";
import { colors } from "../theme";

export default function BookStarRating({
  rating,
  onChange,
  size = 22,
  gap = 2,
  targetSize = size + 8,
}: {
  rating: number | null;
  onChange: (r: number) => void;
  size?: number;
  gap?: number;
  targetSize?: number;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ display: "flex", gap }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => onChange(star)}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setHover(star);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(0);
          }}
          style={{
            cursor: "pointer",
            fontSize: size,
            color: star <= (hover || rating || 0) ? colors.accent : colors.textDim,
            transition: "color 0.1s",
            lineHeight: 1,
            width: targetSize,
            height: targetSize,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
