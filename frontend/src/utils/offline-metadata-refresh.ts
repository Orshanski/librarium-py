import { getOfflineBooks, removeBookFromLocalStorage, updateOfflineBookMetadata } from "./offline-storage";
import { getBook } from "../api/endpoints/books";

/**
 * For every locally stored offline book, fetch fresh card-level metadata from
 * the server and persist it back to IndexedDB. Binary parts (coverBlob,
 * formats) and timestamps are untouched. Per-book failures (404, network) are
 * skipped silently. Safe to invoke unconditionally — no-ops when there are no
 * local books or IDB is unavailable.
 */
export async function refreshOfflineSnapshots(): Promise<void> {
  let books;
  try {
    books = await getOfflineBooks();
  } catch (err) {
    console.warn("refreshOfflineSnapshots: getOfflineBooks failed:", err);
    return;
  }
  if (books.length === 0) return;

  const tasks = books.map(async (local) => {
    try {
      const detail = await getBook(local.bookId);
      const fresh = detail.book;
      if (fresh.isRead) {
        await removeBookFromLocalStorage(local.bookId);
        return;
      }
      await updateOfflineBookMetadata(local.bookId, {
        title: fresh.title,
        authors: fresh.authors,
        series: fresh.series,
        seriesNumber: fresh.seriesNumber,
        rating: fresh.rating,
        isRead: fresh.isRead,
      });
    } catch (err) {
      console.debug(`refreshOfflineSnapshots: skip bookId=${local.bookId}:`, err);
    }
  });
  await Promise.allSettled(tasks);
}
