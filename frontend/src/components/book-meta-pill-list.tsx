import type { CSSProperties } from "react";
import BookMetaPill, { type BookMetaPillTokens } from "./book-meta-pill";

export interface BookMetaPillListTokens {
  pill: BookMetaPillTokens;
  gap: number;
  marginBottom: number;
}

interface BookMetaPillListProps {
  items: ReadonlyArray<string>;
  tokens: BookMetaPillListTokens;
}

export default function BookMetaPillList({ items, tokens }: Readonly<BookMetaPillListProps>) {
  if (items.length === 0) return null;

  const containerStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.gap,
    marginBottom: tokens.marginBottom,
  };

  return (
    <div style={containerStyle}>
      {items.map((item, index) => (
        <BookMetaPill key={`${item}-${index}`} text={item} tokens={tokens.pill} />
      ))}
    </div>
  );
}
