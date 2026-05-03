import type { CSSProperties } from "react";
import { sanitizeHtml } from "../utils/sanitize-html";

export interface BookDescriptionTokens {
  fontSize: number;
  lineHeight: number;
  color: string;
  marginBottom: number;
  maxHeight?: number;
}

interface BookDescriptionProps {
  html: string;
  tokens: BookDescriptionTokens;
}

export default function BookDescription({ html, tokens }: Readonly<BookDescriptionProps>) {
  const style: CSSProperties = {
    fontSize: tokens.fontSize,
    lineHeight: tokens.lineHeight,
    color: tokens.color,
    marginBottom: tokens.marginBottom,
  };

  if (tokens.maxHeight !== undefined) {
    style.maxHeight = tokens.maxHeight;
    style.overflowY = "auto";
  }

  return <div style={style} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
