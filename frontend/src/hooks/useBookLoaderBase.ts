// navigator.onLine is used directly (not useOnlineStatus hook) because we need
// point-in-time checks inside async functions, not reactive state.
import { useState, useRef, useEffect } from "react";
import { LocalProgress, LocalSettings, getProgress, getSettings as getLocalSettings } from "../utils/offline-storage";
import { getBook, setRead as apiSetRead } from "@/api/endpoints/books";
import type { BookDetailResponse } from "@/api/endpoints/books";
import type { LoadProgress } from "../components/ReaderLoadingScreen";

export interface BookLoaderResult {
  bookBlob: Blob | null;
  bookTitle: string;
  loading: boolean;
  loadProgress: LoadProgress;
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
  fromOffline: boolean;
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
  bookData: BookDetailResponse | null;
  fromOffline: boolean;
}) => void;

/** Step 1: parallel-load local progress + per-device reader settings. */
export async function loadLocalData(
  bookId: number,
  deviceName: string,
): Promise<{ localProgress: LocalProgress | null; localSettings: LocalSettings | null }> {
  const [localProgress, localSettings] = await Promise.all([
    getProgress(bookId),
    getLocalSettings(deviceName),
  ]);
  return { localProgress, localSettings };
}

/**
 * Step 3: fetch book metadata when online. Returns final title plus bookData.
 * If `fromOffline` is true and `getBook` fails, the error is swallowed and
 * the strategy-provided `blobTitle` is preserved (offline survives a network blip).
 * If `fromOffline` is false and `getBook` fails, the error propagates.
 */
export async function fetchBookMetadata(
  id: string,
  fromOffline: boolean,
  blobTitle: string,
): Promise<{ title: string; bookData: BookDetailResponse | null }> {
  if (!navigator.onLine) {
    return { title: blobTitle, bookData: null };
  }
  try {
    const bookData = await getBook(Number(id));
    const title = fromOffline ? blobTitle : (bookData.book?.title || "");
    return { title, bookData };
  } catch (err: unknown) {
    if (!fromOffline) {
      throw new Error(err instanceof Error ? err.message : "Failed to fetch book data");
    }
    return { title: blobTitle, bookData: null };
  }
}

/**
 * Step 5: fire-and-forget reset of `isRead` once the user has opened the book again.
 * Always attaches `.catch` to avoid an unhandled promise rejection if the network call fails.
 */
export function markUnreadInBackground(id: string, bookData: BookDetailResponse | null): void {
  if (!navigator.onLine || !bookData?.book?.isRead) return;
  apiSetRead(Number(id), false).catch((err) =>
    console.warn("Failed to clear isRead:", err),
  );
}

/**
 * Step 2: download closure used by `BlobStrategy`. Pulled out so that the
 * progress callback isn't nested 5 levels deep inside `useEffect`.
 */
function makeDownloadCallback(
  id: string,
  format: string,
  setLoadProgress: (p: LoadProgress) => void,
): () => Promise<File> {
  return async () => {
    const { downloadBook } = await import("../utils/book-download");
    return downloadBook(id, format, (percent, bytes) =>
      setLoadProgress({ percent, bytes }),
    );
  };
}

export function useBookLoaderBase(
  options: BookLoaderOptions,
  blobStrategy: BlobStrategy,
  postLoadHook?: PostLoadHook,
): BookLoaderResult {
  const { bookId: id, format, deviceName } = options;

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({ percent: 0, bytes: 0 });
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

    setBookBlob(null);
    setBookTitle("");
    setLoading(true);
    setLoadProgress({ percent: 0, bytes: 0 });
    setError(null);

    (async () => {
      try {
        const { localProgress, localSettings } = await loadLocalData(bookId, deviceName);
        onLocalDataLoadedRef.current(localProgress, localSettings);

        const { blob, title: blobTitle, fromOffline } = await blobStrategyRef.current({
          bookId, id, format,
          download: makeDownloadCallback(id, format, setLoadProgress),
        });

        const { title, bookData } = await fetchBookMetadata(id, fromOffline, blobTitle);

        if (navigator.onLine) {
          await onSyncNeededRef.current(bookId, localProgress, localSettings);
        }

        if (cancelled) return;
        setBookTitle(title);
        setBookBlob(blob);
        setLoading(false);

        markUnreadInBackground(id, bookData);
        postLoadHookRef.current?.({ bookId, id, format, blob, bookData, fromOffline });
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
