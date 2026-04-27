import type { ReactNode } from "react";
import { useIsMobile } from "../responsive";
import { BookGridTokens, DESKTOP_BOOK_GRID, MOBILE_BOOK_GRID } from "./book-layout-tokens";

function pickGridTokens(isMobile: boolean): BookGridTokens {
  if (isMobile) return MOBILE_BOOK_GRID;
  return DESKTOP_BOOK_GRID;
}

export default function BookGrid({ children }: Readonly<{ children: ReactNode }>) {
  const tokens = pickGridTokens(useIsMobile());

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: tokens.columns,
        gap: tokens.gap,
        alignItems: tokens.alignItems,
      }}
    >
      {children}
    </div>
  );
}
