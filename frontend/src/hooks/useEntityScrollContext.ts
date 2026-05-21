import { useMemo } from "react";
import type { BookListContext } from "@/domain/read-models";

type ScrollContextFactory = (key: string, entityId: number) => BookListContext;

// Контракт: factory должен быть referentially stable — типично module-level
// функция вроде authorScrollContext/seriesScrollContext. Если передать inline-arrow
// (новый референс каждый рендер) — useMemo пересчитается каждый раз, ref-стабильность
// scroll-context потеряется, и зависимые useEffect/useScrollRestore начнут срабатывать
// без видимой причины.
export function useEntityScrollContext(
  factory: ScrollContextFactory,
  key: string,
  entityId: number,
): BookListContext {
  return useMemo(() => factory(key, entityId), [factory, key, entityId]);
}
