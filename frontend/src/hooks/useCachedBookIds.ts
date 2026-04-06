import { useState, useEffect } from "react";
import { getCachedBooks } from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

/**
 * Returns a Set of all bookIds cached locally in IndexedDB.
 * Re-fetches when isPwa changes. The hook always returns the full set
 * of cached IDs regardless of the bookIds hint — the parameter is only
 * used to skip the query when the page has no books to show.
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
    }).catch((err) => {
      console.warn("Failed to load cached book IDs:", err);
      setCachedIds(new Set());
    });
  }, [isPwa, bookIds.length]);

  return cachedIds;
}
