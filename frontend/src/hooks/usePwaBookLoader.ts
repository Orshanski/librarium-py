// navigator.onLine is used directly (not useOnlineStatus hook) because we need
// point-in-time checks inside async functions, not reactive state.
import { useState, useEffect } from "react";
import {
  LocalProgress, LocalSettings,
  getProgress, getSettings as getLocalSettings,
  cacheBook, touchBook, getCachedBook, evictLRU,
} from "../utils/offline-storage";
import type { BookLoaderResult } from "./useBookLoader";

interface BookApiResponse {
  book: {
    title: string;
    authors: string;
    id: number;
    is_read?: boolean;
    [key: string]: unknown;
  };
  files: { format: string; file_size: number }[];
  [key: string]: unknown;
}

interface UsePwaBookLoaderOptions {
  bookId: string | undefined;
  format: string | undefined;
  deviceName: string;
  onLocalDataLoaded: (localProgress: LocalProgress | null, localSettings: LocalSettings | null) => void;
  onSyncNeeded: (bookId: number, localProgress: LocalProgress | null, localSettings: LocalSettings | null) => Promise<void>;
}

export function usePwaBookLoader({ bookId: id, format, deviceName, onLocalDataLoaded, onSyncNeeded }: UsePwaBookLoaderOptions): BookLoaderResult {
  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onLocalDataLoadedRef = { current: onLocalDataLoaded };
  onLocalDataLoadedRef.current = onLocalDataLoaded;
  const onSyncNeededRef = { current: onSyncNeeded };
  onSyncNeededRef.current = onSyncNeeded;

  useEffect(() => {
    if (!id || !format) return;
    const bookId = Number(id);

    const downloadBlob = async (): Promise<File> => {
      const r = await fetch(`/api/books/${id}/download?format=${format}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to download book");
      if (!r.body) {
        const b = await r.blob();
        return new File([b], `book.${format}`, { type: b.type });
      }
      const total = Number(r.headers.get("content-length")) || 0;
      const reader = r.body.getReader();
      let received = 0;
      const chunks: BlobPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) {
          setLoadProgress(Math.round((received / total) * 100));
        } else {
          setLoadProgress(-(received));
        }
      }
      const blob = new Blob(chunks);
      return new File([blob], `book.${format}`, { type: r.headers.get("content-type") || "" });
    };

    (async () => {
      try {
        // 1. Local progress + settings (instant)
        const [localProgress, localSettings] = await Promise.all([
          getProgress(bookId),
          getLocalSettings(deviceName),
        ]);
        onLocalDataLoadedRef.current(localProgress, localSettings);

        // 2. Book blob — cache first, network fallback
        let blob: File;
        let title = "";
        let fromCache = false;
        let bookData: BookApiResponse | null = null;

        const cached = await getCachedBook(bookId);
        if (cached) {
          await touchBook(bookId);
          const fmt = cached.formats.find((f) => f.format.toLowerCase() === format!.toLowerCase());
          if (fmt) {
            blob = new File([fmt.fileBlob], `book.${format}`, { type: "" });
            title = cached.title;
            fromCache = true;
          } else if (navigator.onLine) {
            blob = await downloadBlob();
          } else {
            throw new Error("Формат не найден в кэше");
          }
        } else if (navigator.onLine) {
          blob = await downloadBlob();
        } else {
          throw new Error("Книга не сохранена для оффлайн-чтения");
        }

        // 3. Fetch metadata (online only)
        if (navigator.onLine) {
          const resp = await fetch(`/api/books/${id}`, { credentials: "include" });
          if (resp.ok) {
            bookData = await resp.json() as BookApiResponse;
            if (!fromCache) title = bookData.book?.title || "";
          } else if (!fromCache) {
            throw new Error("Failed to fetch book data");
          }
        }

        // 4. Sync progress/settings with server BEFORE mounting reader
        if (navigator.onLine) {
          await onSyncNeededRef.current(bookId, localProgress, localSettings);
        }

        setBookTitle(title);
        setBookBlob(blob);
        setLoading(false);

        // 5. Background tasks (online only)
        if (navigator.onLine) {
          if (bookData?.book?.is_read) {
            fetch(`/api/books/${id}/read`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ isRead: false }),
            }).catch((err) => console.warn("Failed to clear is_read:", err));
          }
          autoCacheBook(bookId, blob, bookData, fromCache);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();

    function autoCacheBook(bookId: number, blob: Blob, bookData: BookApiResponse | null, fromCache: boolean) {
      if (fromCache || !bookData) return;
      const bk = bookData.book;
      const allFiles = bookData.files || [];
      (async () => {
        const files = await Promise.all(
          allFiles.map(async (f: { format: string; file_size: number }) => {
            if (f.format.toLowerCase() === format!.toLowerCase()) {
              return { format: f.format, fileBlob: blob, fileSize: f.file_size };
            }
            const resp = await fetch(`/api/books/${id}/download?format=${f.format}`, { credentials: "include" });
            if (!resp.ok) { console.warn(`Failed to download format ${f.format}`); return null; }
            return { format: f.format, fileBlob: await resp.blob(), fileSize: f.file_size };
          }),
        );
        const validFiles = files.filter((f): f is { format: string; fileBlob: Blob; fileSize: number } => f !== null);
        if (validFiles.length === 0) return;
        const coverResp = await fetch(`/api/covers/${id}?full=1`, { credentials: "include" });
        if (!coverResp.ok) { console.warn("Failed to fetch cover for caching"); return; }
        const cover = await coverResp.blob();
        const authors = (bk.authors || "").split(",").map((a: string) => a.trim()).filter(Boolean);
        try {
          await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
        } catch (cacheErr: unknown) {
          if (cacheErr instanceof DOMException && cacheErr.name === "QuotaExceededError") {
            const totalSize = validFiles.reduce((sum, f) => sum + f.fileSize, 0);
            await evictLRU(totalSize);
            try {
              await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
            } catch (retryErr) {
              console.warn("Failed to cache book after eviction:", retryErr);
            }
          } else {
            console.warn("Failed to cache book:", cacheErr);
          }
        }
      })().catch((err) => console.warn("Failed to auto-cache book:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName, format, id]);

  return { bookBlob, bookTitle, loading, loadProgress, error };
}
