// navigator.onLine is used directly (not useOnlineStatus hook) because we need
// point-in-time checks inside async functions, not reactive state.
import { useState, useRef, useEffect } from "react";
import { LocalProgress, LocalSettings, getProgress, getSettings as getLocalSettings } from "../utils/offline-storage";
import type { BookApiResponse } from "../types/api";

export interface BookLoaderResult {
  bookBlob: Blob | null;
  bookTitle: string;
  loading: boolean;
  loadProgress: number;
  error: string | null;
}

export interface BookLoaderOptions {
  bookId: string | undefined;
  format: string | undefined;
  deviceName: string;
  onLocalDataLoaded: (localProgress: LocalProgress | null, localSettings: LocalSettings | null) => void;
  onSyncNeeded: (bookId: number, localProgress: LocalProgress | null, localSettings: LocalSettings | null) => Promise<void>;
}

/** Result of the blob acquisition step, provided by the strategy. */
export interface BlobResult {
  blob: File;
  title: string;
  fromCache: boolean;
}

/**
 * Strategy for acquiring the book blob. Called during the load flow.
 * Receives bookId, id (string), format, and a download function with progress.
 */
export type BlobStrategy = (ctx: {
  bookId: number;
  id: string;
  format: string;
  download: () => Promise<File>;
}) => Promise<BlobResult>;

/**
 * Optional post-load hook. Called after successful load with the blob result
 * and book metadata. Used by PWA loader for auto-caching.
 */
export type PostLoadHook = (ctx: {
  bookId: number;
  id: string;
  format: string;
  blob: File;
  bookData: BookApiResponse | null;
  fromCache: boolean;
}) => void;

export function useBookLoaderBase(
  options: BookLoaderOptions,
  blobStrategy: BlobStrategy,
  postLoadHook?: PostLoadHook,
): BookLoaderResult {
  const { bookId: id, format, deviceName } = options;

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onLocalDataLoadedRef = useRef(options.onLocalDataLoaded);
  onLocalDataLoadedRef.current = options.onLocalDataLoaded;
  const onSyncNeededRef = useRef(options.onSyncNeeded);
  onSyncNeededRef.current = options.onSyncNeeded;
  const blobStrategyRef = useRef(blobStrategy);
  blobStrategyRef.current = blobStrategy;
  const postLoadHookRef = useRef(postLoadHook);
  postLoadHookRef.current = postLoadHook;

  useEffect(() => {
    if (!id || !format) return;
    const bookId = Number(id);
    let cancelled = false;

    // Reset transient state when id/format changes
    setBookBlob(null);
    setBookTitle("");
    setLoading(true);
    setLoadProgress(0);
    setError(null);

    (async () => {
      try {
        // 1. Local progress + settings (instant)
        const [localProgress, localSettings] = await Promise.all([
          getProgress(bookId),
          getLocalSettings(deviceName),
        ]);
        onLocalDataLoadedRef.current(localProgress, localSettings);

        // 2. Acquire blob via strategy
        const { blob, title: blobTitle, fromCache } = await blobStrategyRef.current({
          bookId, id, format,
          download: async () => {
            const { downloadBook } = await import("../utils/book-download");
            return downloadBook(id, format, setLoadProgress);
          },
        });

        // 3. Fetch metadata (online only)
        let title = blobTitle;
        let bookData: BookApiResponse | null = null;
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

        if (cancelled) return;
        setBookTitle(title);
        setBookBlob(blob);
        setLoading(false);

        // 5. Background: clear is_read + post-load hook
        if (navigator.onLine && bookData?.book?.is_read) {
          fetch(`/api/books/${id}/read`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isRead: false }),
          }).catch((err) => console.warn("Failed to clear is_read:", err));
        }
        postLoadHookRef.current?.({ bookId, id, format, blob, bookData, fromCache });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName, format, id]);

  return { bookBlob, bookTitle, loading, loadProgress, error };
}
