// navigator.onLine is used directly (not useOnlineStatus hook) because we need
// point-in-time checks inside async functions, not reactive state.
import { useState, useEffect } from "react";
import { LocalProgress, LocalSettings, getProgress, getSettings as getLocalSettings } from "../utils/offline-storage";

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

export interface BookLoaderResult {
  bookBlob: Blob | null;
  bookTitle: string;
  loading: boolean;
  loadProgress: number;
  error: string | null;
}

interface UseBookLoaderOptions {
  bookId: string | undefined;
  format: string | undefined;
  deviceName: string;
  onLocalDataLoaded: (localProgress: LocalProgress | null, localSettings: LocalSettings | null) => void;
  onSyncNeeded: (bookId: number, localProgress: LocalProgress | null, localSettings: LocalSettings | null) => Promise<void>;
}

export function useBookLoader({ bookId: id, format, deviceName, onLocalDataLoaded, onSyncNeeded }: UseBookLoaderOptions): BookLoaderResult {
  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Stable refs to avoid re-running effect when callbacks change
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

        // 2. Download book
        const blob = await downloadBlob();

        // 3. Fetch metadata
        let title = "";
        let bookData: BookApiResponse | null = null;
        if (navigator.onLine) {
          const resp = await fetch(`/api/books/${id}`, { credentials: "include" });
          if (resp.ok) {
            bookData = await resp.json() as BookApiResponse;
            title = bookData.book?.title || "";
          } else {
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

        // 5. Background: clear is_read
        if (navigator.onLine && bookData?.book?.is_read) {
          fetch(`/api/books/${id}/read`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isRead: false }),
          }).catch((err) => console.warn("Failed to clear is_read:", err));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName, format, id]);

  return { bookBlob, bookTitle, loading, loadProgress, error };
}
