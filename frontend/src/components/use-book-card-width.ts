import { useEffect, useState } from "react";
import { useIsMobile } from "../responsive";
import { computeMobileBookCardWidth } from "./book-card-tokens";
import { DESKTOP_BOOK_GRID_COLUMN_WIDTH_PX } from "./book-layout-tokens";

/**
 * Возвращает ширину карточки книги в пикселях для grid-callsite'ов
 * (catalog/listings/search/similar/offline).
 *
 * На desktop — фиксированная ширина column'а каталога. На mobile — вычисляется
 * по формуле от viewport (`window.innerWidth`) и known constants grid-структуры
 * (количество колонок, отступы, padding страницы); подписан на resize.
 *
 * Series-rail callsite'ы (BookDetail) не используют этот хук — у них собственная
 * фиксированная ширина `SERIES_RAIL_COVER_WIDTH`.
 */
export function useBookCardWidth(): number {
  const isMobile = useIsMobile();
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (typeof globalThis.window === "undefined") return 0;
    return globalThis.window.innerWidth;
  });

  useEffect(() => {
    if (!isMobile) return;
    setViewportWidth(globalThis.window.innerWidth);
    function onResize() {
      setViewportWidth(globalThis.window.innerWidth);
    }
    globalThis.window.addEventListener("resize", onResize);
    return () => globalThis.window.removeEventListener("resize", onResize);
  }, [isMobile]);

  if (isMobile) return computeMobileBookCardWidth(viewportWidth);
  return DESKTOP_BOOK_GRID_COLUMN_WIDTH_PX;
}
