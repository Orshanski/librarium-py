import type { Book, BookDetailSnapshot } from "@/types";

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
  | "identifiers"
  | "recap";

export type DomainEventMap = {
  bookUpdated: {
    book: MinimalBook;
    detail?: BookDetailSnapshot;
    changedFields: BookChangedField[];
    affected?: {
      authorIds?: number[];
      seriesId?: number | null;
      seriesIds?: Array<number | null>;
      tagIds?: number[];
      language?: string | null;
      languages?: Array<string | null>;
    };
  };
  bookCreated: { bookId: number; book?: MinimalBook };
  bookDeleted: { bookId: number };
  bookRatingChanged: { bookId: number; rating: number | null };
  bookReadChanged: { bookId: number; isRead: boolean };
  bookHiddenChanged: { bookId: number; isHidden: boolean };
  authorRenamed: { authorId: number; name: string; sortName?: string };
  authorMerged: { targetId: number; sourceId: number };
  authorDeleted: { authorId: number };
  seriesRenamed: { seriesId: number; name: string; sortName?: string };
  seriesMerged: { targetId: number; sourceId: number };
  seriesDeleted: { seriesId: number };
  tagRenamed: { tagId: number; name: string };
  tagMerged: { targetId: number; sourceId: number };
  tagDeleted: { tagId: number };
  shelfCreated: { shelfId: number; name: string };
  shelfRenamed: { shelfId: number; name: string };
  shelfDeleted: { shelfId: number };
  shelfMembershipChanged: { shelfId: number; bookId: number; hasBook: boolean; book?: Book };
  // Офлайн-копия книги сохранена или удалена. Нужен, чтобы бейджи «скачано» в списках
  // не расходились с состоянием на странице книги: раньше набор читался один раз при
  // отрисовке и после сохранения книги оставался прежним.
  offlineBookChanged: { bookId: number; hasOffline: boolean };
  readingProgressChanged: {
    bookId: number;
    hadPosition: boolean;
    hasPosition: boolean;
    lastReadAtChanged: boolean;
    fraction: number;
    lastFormat: string;
    lastReadAt: string;
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
