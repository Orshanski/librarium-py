import { useBookLoaderBase } from "./useBookLoaderBase";
import type { BookLoaderOptions, BookLoaderResult } from "./useBookLoaderBase";
import type { BookDetailResponse } from "@/api/endpoints/books";
import { downloadBook } from "@/api/endpoints/books";
import { saveOfflineBook, touchOfflineBook, getOfflineBook, evictLRU } from "../utils/offline-storage";
import { getCover } from "@/api/endpoints/covers";

export function usePwaBookLoader(options: BookLoaderOptions): BookLoaderResult {
  return useBookLoaderBase(
    options,
    // Blob strategy: offline-first, network fallback
    async ({ bookId, id, format, download }) => {
      const offlineBook = await getOfflineBook(bookId);
      if (offlineBook) {
        await touchOfflineBook(bookId);
        const fmt = offlineBook.formats.find((f) => f.format.toLowerCase() === format.toLowerCase());
        if (fmt) {
          return {
            blob: new File([fmt.fileBlob], `book.${format}`, { type: "" }),
            title: offlineBook.title,
            fromOffline: true,
          };
        }
        if (navigator.onLine) {
          return { blob: await download(), title: "", fromOffline: false };
        }
        throw new Error("Формат не найден в оффлайн-хранилище");
      }
      if (navigator.onLine) {
        return { blob: await download(), title: "", fromOffline: false };
      }
      throw new Error("Книга не сохранена для оффлайн-чтения");
    },
    // Post-load hook: auto-save all formats offline
    ({ bookId, id, format, blob, bookData, fromOffline }) => {
      if (fromOffline || !bookData) return;
      autoSaveOfflineBook(bookId, id, format, blob, bookData);
    },
  );
}

function autoSaveOfflineBook(bookId: number, id: string, format: string, blob: Blob, bookData: BookDetailResponse) {
  const bk = bookData.book;
  const allFiles = bookData.files || [];
  (async () => {
    const files = await Promise.all(
      allFiles.map(async (f) => {
        if (f.format.toLowerCase() === format.toLowerCase()) {
          return { format: f.format, fileBlob: blob, fileSize: f.fileSize ?? 0 };
        }
        let fileBlob: Blob;
        try {
          fileBlob = await downloadBook(bookId, f.format);
        } catch {
          console.warn(`Failed to download format ${f.format}`);
          return null;
        }
        return { format: f.format, fileBlob, fileSize: f.fileSize ?? 0 };
      }),
    );
    const validFiles = files.filter((f): f is { format: string; fileBlob: Blob; fileSize: number } => f !== null);
    if (validFiles.length === 0) return;
    let cover: Blob;
    try {
      cover = await getCover(bookId, true);
    } catch {
      console.warn("Failed to fetch cover for offline save");
      return;
    }
    const authors = (bk.authors || []).map((a) => a.name);
    try {
      await saveOfflineBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
    } catch (saveErr: unknown) {
      if (saveErr instanceof DOMException && saveErr.name === "QuotaExceededError") {
        const totalSize = validFiles.reduce((sum, f) => sum + f.fileSize, 0);
        await evictLRU(totalSize);
        try {
          await saveOfflineBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
        } catch (retryErr) {
          console.warn("Failed to save offline book after eviction:", retryErr);
        }
      } else {
        console.warn("Failed to save offline book:", saveErr);
      }
    }
  })().catch((err) => console.warn("Failed to auto-save offline book:", err));
}
