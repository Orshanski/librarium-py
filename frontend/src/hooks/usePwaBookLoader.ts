import { useBookLoaderBase } from "./useBookLoaderBase";
import type { BookLoaderOptions, BookLoaderResult } from "./useBookLoaderBase";
import type { BookApiResponse } from "../types/api";
import { cacheBook, touchBook, getCachedBook, evictLRU } from "../utils/offline-storage";
import { getCover } from "@/api/endpoints/covers";

export function usePwaBookLoader(options: BookLoaderOptions): BookLoaderResult {
  return useBookLoaderBase(
    options,
    // Blob strategy: cache-first, network fallback
    async ({ bookId, id, format, download }) => {
      const cached = await getCachedBook(bookId);
      if (cached) {
        await touchBook(bookId);
        const fmt = cached.formats.find((f) => f.format.toLowerCase() === format.toLowerCase());
        if (fmt) {
          return {
            blob: new File([fmt.fileBlob], `book.${format}`, { type: "" }),
            title: cached.title,
            fromCache: true,
          };
        }
        if (navigator.onLine) {
          return { blob: await download(), title: "", fromCache: false };
        }
        throw new Error("Формат не найден в кэше");
      }
      if (navigator.onLine) {
        return { blob: await download(), title: "", fromCache: false };
      }
      throw new Error("Книга не сохранена для оффлайн-чтения");
    },
    // Post-load hook: auto-cache all formats
    ({ bookId, id, format, blob, bookData, fromCache }) => {
      if (fromCache || !bookData) return;
      autoCacheBook(bookId, id, format, blob, bookData);
    },
  );
}

function autoCacheBook(bookId: number, id: string, format: string, blob: Blob, bookData: BookApiResponse) {
  const bk = bookData.book;
  const allFiles = bookData.files || [];
  (async () => {
    const files = await Promise.all(
      allFiles.map(async (f: { format: string; file_size: number }) => {
        if (f.format.toLowerCase() === format.toLowerCase()) {
          return { format: f.format, fileBlob: blob, fileSize: f.file_size };
        }
        const resp = await fetch(`/api/books/${id}/download?format=${f.format}`, { credentials: "include" });
        if (!resp.ok) { console.warn(`Failed to download format ${f.format}`); return null; }
        return { format: f.format, fileBlob: await resp.blob(), fileSize: f.file_size };
      }),
    );
    const validFiles = files.filter((f): f is { format: string; fileBlob: Blob; fileSize: number } => f !== null);
    if (validFiles.length === 0) return;
    let cover: Blob;
    try {
      cover = await getCover(bookId, true);
    } catch {
      console.warn("Failed to fetch cover for caching");
      return;
    }
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
