import { useState, useEffect, useCallback } from "react";
import { hasOfflineBook as checkOffline, saveOfflineBook, removeBookFromLocalStorage, removeOfflineBook } from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

export function useOfflineBookStatus(bookId: number | undefined) {
  const isPwa = useIsPwa();
  const [hasOffline, setHasOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPwa || !bookId) return;
    checkOffline(bookId).then(setHasOffline).catch((err) => {
      console.warn("Failed to check offline status:", err);
      setHasOffline(false);
    });
  }, [bookId, isPwa]);

  const toggleOffline = useCallback(async (
    meta: { title: string; authors: string[]; manuallyAdded?: boolean },
    fetchFiles: () => Promise<{ format: string; fileBlob: Blob; fileSize: number }[]>,
    fetchCover: () => Promise<Blob>,
  ) => {
    if (!bookId) return;
    if (hasOffline) {
      await removeOfflineBook(bookId);
      setHasOffline(false);
    } else {
      setLoading(true);
      try {
        const [files, cover] = await Promise.all([fetchFiles(), fetchCover()]);
        await saveOfflineBook({ bookId, ...meta }, files, cover);
        setHasOffline(true);
      } finally {
        setLoading(false);
      }
    }
  }, [bookId, hasOffline]);

  const evict = useCallback(async () => {
    if (!bookId) return;
    await removeBookFromLocalStorage(bookId);
    setHasOffline(false);
  }, [bookId]);

  return { hasOffline: isPwa && hasOffline, loading, toggleOffline, evict, isPwa };
}
