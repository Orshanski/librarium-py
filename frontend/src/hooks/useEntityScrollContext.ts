import { useMemo } from "react";
import type { BookListContext } from "@/domain/read-models";

type ScrollContextFactory = (key: string, entityId: number) => BookListContext;

export function useEntityScrollContext(
  factory: ScrollContextFactory,
  key: string,
  entityId: number,
): BookListContext {
  return useMemo(() => factory(key, entityId), [factory, key, entityId]);
}
