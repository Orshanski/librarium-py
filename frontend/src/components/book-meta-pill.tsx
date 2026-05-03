import type { CSSProperties } from "react";

export interface BookMetaPillTokens {
  padding: string;
  fontSize: number;
  borderRadius: number;
  background: string;
  border: string;
  color: string;
}

interface BookMetaPillProps {
  text: string;
  tokens: BookMetaPillTokens;
}

export default function BookMetaPill({ text, tokens }: Readonly<BookMetaPillProps>) {
  const style: CSSProperties = {
    padding: tokens.padding,
    fontSize: tokens.fontSize,
    borderRadius: tokens.borderRadius,
    background: tokens.background,
    border: tokens.border,
    color: tokens.color,
    display: "inline-block",
    whiteSpace: "nowrap",
  };

  return <span style={style}>{text}</span>;
}
