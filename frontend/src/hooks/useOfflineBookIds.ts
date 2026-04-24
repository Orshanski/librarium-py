import { useState, useEffect } from "react";
import { getOfflineBooks } from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

/**
 * Returns a Set of all bookIds saved offline in IndexedDB.
 * Re-fetches when isPwa changes. The hook always returns the full set
 * of offline IDs regardless of the bookIds hint — the parameter is only
 * used to skip the query when the page has no books to show.
 */
export function useOfflineBookIds(bookIds: number[]): Set<number> {
  const isPwa = useIsPwa();
  const [offlineIds, setOfflineIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isPwa || bookIds.length === 0) {
      setOfflineIds(new Set());
      return;
    }
    getOfflineBooks().then((offline) => {
      const ids = new Set(offline.map((b) => b.bookId));
      setOfflineIds(ids);
    }).catch((err) => {
      console.warn("Failed to load offline book IDs:", err);
      setOfflineIds(new Set());
    });
  }, [isPwa, bookIds.length]);

  return offlineIds;
}
