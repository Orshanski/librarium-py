import type { ReactNode } from "react";
import { useIsMobile } from "../responsive";
import { BookRailTokens, DESKTOP_BOOK_RAIL, MOBILE_BOOK_RAIL } from "./book-layout-tokens";

function pickRailTokens(isMobile: boolean): BookRailTokens {
  if (isMobile) return MOBILE_BOOK_RAIL;
  return DESKTOP_BOOK_RAIL;
}

export default function BookRail({ children }: Readonly<{ children: ReactNode }>) {
  const tokens = pickRailTokens(useIsMobile());

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
