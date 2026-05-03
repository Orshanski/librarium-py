import type { BookDetailResponse } from "@/api/endpoints/books";

type MinimalBook = {
  id: number;
  title?: string;
  rating?: number | null;
  isRead?: boolean | number | null;
};

export type BookChangedField =
  | "title"
  | "description"
  | "publisher"
  | "pubDate"
  | "coverPath"
  | "authors"
  | "series"
  | "seriesNumber"
  | "tags"
  | "language"
  | "rating"
  | "read"
  | "files"
  | "identifiers";

export type DomainEventMap = {
  bookUpdated: {
    book: MinimalBook;
    detail?: BookDetailResponse;
    changedFields: BookChangedField[];
    affected?: {
      authorIds?: number[];
      seriesId?: number | null;
      tagIds?: number[];
      language?: string | null;
    };
  };
  bookCreated: { bookId: number; book?: MinimalBook };
  bookDeleted: { bookId: number };
  bookRatingChanged: { bookId: number; rating: number | null };
  bookReadChanged: { bookId: number; isRead: boolean };
  authorRenamed: { authorId: number; name: string; sortName?: string };
  authorMerged: { targetId: number; sourceId: number };
  authorDeleted: { authorId: number };
  seriesRenamed: { seriesId: number; name: string; sortName?: string };
  seriesMerged: { targetId: number; sourceId: number };
  seriesDeleted: { seriesId: number };
  tagMapped: { tagId: number; targetId: number; name: string };
  shelfCreated: { shelfId: number; name: string };
  shelfRenamed: { shelfId: number; name: string };
  shelfDeleted: { shelfId: number };
  shelfMembershipChanged: { shelfId: number; bookId: number; hasBook: boolean };
  readingProgressChanged: {
    bookId: number;
    hadPosition: boolean;
    hasPosition: boolean;
    lastReadAtChanged: boolean;
  };
};

type Handler<E extends keyof DomainEventMap> = (payload: DomainEventMap[E]) => void;

class DomainEventBus {
  private handlers = new Map<keyof DomainEventMap, Set<Handler<keyof DomainEventMap>>>();

  subscribe<E extends keyof DomainEventMap>(type: E, handler: Handler<E>): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler<keyof DomainEventMap>>();
    set.add(handler as Handler<keyof DomainEventMap>);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as Handler<keyof DomainEventMap>);
    };
  }

  publish<E extends keyof DomainEventMap>(type: E, payload: DomainEventMap[E]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<E>)(payload);
      } catch (error) {
        console.error("domain event handler failed", { type, error });
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const domainEvents = new DomainEventBus();
