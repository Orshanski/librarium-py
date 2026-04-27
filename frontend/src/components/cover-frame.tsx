import type { CSSProperties, ReactNode } from "react";

export type CoverSizing =
  | { kind: "fixed"; height: number; width?: number | "auto"; maxWidth?: string }
  | { kind: "aspect"; aspectRatio: string; objectFit: "cover" | "contain" };

export interface CoverFrameTokens {
  sizing: CoverSizing;
  radius: number;
  border: string;
  marginBottom: number;
  background?: string;
}

interface CoverFrameProps {
  src: string;
  alt: string;
  tokens: CoverFrameTokens;
  children?: ReactNode;
}

function imgStyleFromSizing(sizing: CoverSizing): CSSProperties {
  if (sizing.kind === "fixed") {
    return {
      width: sizing.width ?? "auto",
      height: sizing.height,
      maxWidth: sizing.maxWidth,
      display: "block",
    };
  }
  return {
    width: "100%",
    aspectRatio: sizing.aspectRatio,
    objectFit: sizing.objectFit,
    display: "block",
  };
}

export default function CoverFrame({ src, alt, tokens, children }: Readonly<CoverFrameProps>) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: tokens.radius,
        overflow: "hidden",
        border: tokens.border,
        marginBottom: tokens.marginBottom,
        backgroundColor: tokens.background,
      }}
    >
      <img src={src} alt={alt} loading="lazy" style={imgStyleFromSizing(tokens.sizing)} />
      {children}
    </div>
  );
}
