import type { CoverFrameTokens } from "./cover-frame";

export const DESKTOP_COVER_FRAME: CoverFrameTokens = {
  sizing: { kind: "fixed", height: 230, width: "auto", maxWidth: "100%" },
  radius: 4,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  marginBottom: 8,
};

const MOBILE_FRAME_BASE: Omit<CoverFrameTokens, "radius"> = {
  sizing: { kind: "aspect", aspectRatio: "2 / 3", objectFit: "cover" },
  border: "1px solid rgba(255, 255, 255, 0.12)",
  marginBottom: 6,
  backgroundColor: "rgba(255,255,255,0.03)",
};

export const MOBILE_BOOK_CARD_COVER_FRAME: CoverFrameTokens = { ...MOBILE_FRAME_BASE, radius: 6 };
export const MOBILE_SIMILAR_COVER_FRAME: CoverFrameTokens = { ...MOBILE_FRAME_BASE, radius: 4 };

export function offlineBottomFor(base: number, hasProgress: boolean): number {
  if (hasProgress) return 7;
  return base;
}
