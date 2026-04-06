import { useState, useEffect, useCallback } from "react";
import { isCached as checkCached, cacheBook, removeCachedBook } from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

export function useCacheStatus(bookId: number | undefined) {
  const isPwa = useIsPwa();
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPwa || !bookId) return;
    checkCached(bookId).then(setCached);
  }, [bookId, isPwa]);

  const toggleCache = useCallback(async (
    meta: { title: string; authors: string[]; manuallyAdded?: boolean },
    fetchFiles: () => Promise<{ format: string; fileBlob: Blob; fileSize: number }[]>,
    fetchCover: () => Promise<Blob>,
  ) => {
    if (!bookId) return;
    if (cached) {
      await removeCachedBook(bookId);
      setCached(false);
    } else {
      setLoading(true);
      try {
        const [files, cover] = await Promise.all([fetchFiles(), fetchCover()]);
        await cacheBook({ bookId, ...meta }, files, cover);
        setCached(true);
      } finally {
        setLoading(false);
      }
    }
  }, [bookId, cached]);

  return { cached: isPwa && cached, loading, toggleCache, isPwa };
}
