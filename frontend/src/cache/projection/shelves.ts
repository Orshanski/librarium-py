import type { DomainEventMap } from "@/domain/events";
import type { BookListRow } from "./book-list";
import { isRecord } from "./guards";
import type { ProjectionCacheEntry, ProjectionWriter } from "./writer";

export type ShelfMembershipProjectionResult = {
  entries: Array<[string, ProjectionCacheEntry]>;
  invalidatedKeys: string[];
};

export function projectShelfMembershipChange(
  entries: Iterable<[string, ProjectionCacheEntry]>,
  payload: DomainEventMap["shelfMembershipChanged"],
): ShelfMembershipProjectionResult {
  const { bookId, hasBook, book } = payload;
  const nextEntries: Array<[string, ProjectionCacheEntry]> = [];
  const invalidatedKeys: string[] = [];

  for (const [key, entry] of entries) {
    const value = entry.value as Record<string, unknown>;
    const booksField = (value as { books?: unknown }).books;
    if (!hasBook) {
      if (Array.isArray(booksField)) {
        const books = booksField as BookListRow[];
        const filtered = books.filter((row) => row.id !== bookId);
        if (filtered.length !== books.length) {
          nextEntries.push([key, { ...entry, value: { ...value, books: filtered } }]);
        }
      }
    } else if (book !== undefined) {
      if (Array.isArray(booksField)) {
        const books = booksField as BookListRow[];
        const alreadyPresent = books.some((row) => row.id === book.id);
        if (!alreadyPresent) {
          nextEntries.push([key, { ...entry, value: { ...value, books: [...books, book as unknown as BookListRow] } }]);
        }
      }
    } else {
      invalidatedKeys.push(key);
    }
  }

  return { entries: nextEntries, invalidatedKeys };
}

export function applyShelfRename(writer: ProjectionWriter, payload: DomainEventMap["shelfRenamed"]): void {
  const { shelfId, name } = payload;
  writer.patchDetailNamespace(`shelf/${shelfId}`, (value) => {
    const shelf = value.shelf;
    return isRecord(shelf) ? { ...value, shelf: { ...shelf, name } } : undefined;
  });
}
