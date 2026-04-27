import type { ReactNode } from "react";
import { useIsMobile } from "../responsive";
import { DESKTOP_BOOK_RAIL, MOBILE_BOOK_RAIL } from "./book-layout-tokens";

export default function BookRail({ children }: Readonly<{ children: ReactNode }>) {
  const isMobile = useIsMobile();
  const tokens = isMobile ? MOBILE_BOOK_RAIL : DESKTOP_BOOK_RAIL;

  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: tokens.itemWidth,
        gap: tokens.gap,
        overflowX: "auto",
        paddingBottom: 8,
        justifyContent: "start",
      }}
    >
      {children}
    </div>
  );
}
