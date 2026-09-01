import { useBookLoaderBase } from "./useBookLoaderBase";
import type { BookLoaderOptions, BookLoaderResult } from "./useBookLoaderBase";
import type { BookDetailResponse } from "@/api/endpoints/books";
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
    // После загрузки: автосохранение читаемого формата в офлайн
    ({ bookId, format, blob, bookData, fromOffline }) => {
      if (fromOffline || !bookData) return;
      autoSaveOfflineBook(bookId, format, blob, bookData);
    },
  );
}

/**
 * Автосохранение — побочный эффект чтения: в офлайн кладётся только читаемый формат. Уже сохранённые
 * форматы книги остаются, как и признак «добавлено вручную».
 */
export function autoSaveOfflineBook(bookId: number, format: string, blob: Blob, bookData: BookDetailResponse): Promise<void> {
  const bk = bookData.book;
  const readFile = (bookData.files || []).find((f) => f.format.toLowerCase() === format.toLowerCase());
  const readFormat = { format: readFile?.format ?? format, fileBlob: blob, fileSize: readFile?.fileSize ?? blob.size };
  return (async () => {
    let cover: Blob;
    try {
      cover = await getCover(bookId, true);
    } catch {
      console.warn("Failed to fetch cover for offline save");
      return;
    }
    // Сохранённое читается вплотную к записи: между ними не должно быть сетевого ожидания,
    // иначе параллельное «скачать офлайн» успеет записаться и будет затёрто.
    const existing = await getOfflineBook(bookId);
    const kept = existing?.formats.filter((f) => f.format.toLowerCase() !== readFormat.format.toLowerCase()) ?? [];
    const files = [...kept, readFormat];
    const manuallyAdded = existing?.manuallyAdded ?? false;
    try {
      await saveOfflineBook(bk, files, cover, manuallyAdded);
    } catch (saveErr: unknown) {
      if (saveErr instanceof DOMException && saveErr.name === "QuotaExceededError") {
        // Новые байты — только читаемый формат; уже сохранённые заменяют сами себя.
        await evictLRU(readFormat.fileSize);
        try {
          await saveOfflineBook(bk, files, cover, manuallyAdded);
        } catch (retryErr) {
          console.warn("Failed to save offline book after eviction:", retryErr);
        }
      } else {
        console.warn("Failed to save offline book:", saveErr);
      }
    }
  })().catch((err) => console.warn("Failed to auto-save offline book:", err));
}
