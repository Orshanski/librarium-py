import type { ReactNode } from "react";
import { useIsMobile } from "../responsive";
import { DESKTOP_BOOK_GRID, MOBILE_BOOK_GRID } from "./book-layout-tokens";

export default function BookGrid({ children }: Readonly<{ children: ReactNode }>) {
  const isMobile = useIsMobile();
  const tokens = isMobile ? MOBILE_BOOK_GRID : DESKTOP_BOOK_GRID;

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
