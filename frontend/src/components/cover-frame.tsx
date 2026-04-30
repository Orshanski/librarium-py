import type { CSSProperties, ReactNode } from "react";
import { COVER_FRAME_ASPECT_RATIO } from "./book-card-tokens";

export interface CoverFrameTokens {
  width: number;
  radius: number;
  border: string;
  marginBottom: number;
  opacity?: number;
}

interface CoverFrameProps {
  src: string;
  alt: string;
  tokens: CoverFrameTokens;
  children?: ReactNode;
}

const IMG_STYLE: CSSProperties = {
  width: "auto",
  height: "100%",
  maxWidth: "100%",
  display: "block",
};

export default function CoverFrame({ src, alt, tokens, children }: Readonly<CoverFrameProps>) {
  const frameStyle: CSSProperties = {
    position: "relative",
    boxSizing: "border-box",
    width: tokens.width,
    aspectRatio: COVER_FRAME_ASPECT_RATIO,
    borderRadius: tokens.radius,
    overflow: "hidden",
    border: tokens.border,
    marginBottom: tokens.marginBottom,
    opacity: tokens.opacity,
  };

  return (
    <div style={frameStyle}>
      <img src={src} alt={alt} loading="lazy" style={IMG_STYLE} />
      {children}
    </div>
  );
}
