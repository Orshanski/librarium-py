import { useState, useEffect } from "react";
import { getCachedBooks } from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

/**
 * Returns a Set of bookIds that are cached locally in IndexedDB.
 * Refreshes when bookIds array changes.
 */
export function useCachedBookIds(bookIds: number[]): Set<number> {
  const isPwa = useIsPwa();
  const [cachedIds, setCachedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isPwa || bookIds.length === 0) {
      setCachedIds(new Set());
      return;
    }
    getCachedBooks().then((cached) => {
      const ids = new Set(cached.map((b) => b.bookId));
      setCachedIds(ids);
    }).catch(() => setCachedIds(new Set()));
  }, [isPwa, bookIds.length]);

  return cachedIds;
}
