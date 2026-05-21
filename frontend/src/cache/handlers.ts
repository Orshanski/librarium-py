import { domainEvents } from "@/domain/events";
import type { DomainEventMap } from "@/domain/events";
import type { MetadataCacheStore } from "./store";

type EventBus = typeof domainEvents;

const FILTER_OPTION_NAMESPACES = [
  "filter-options/authors",
  "filter-options/series",
  "filter-options/tags",
  "filter-options/languages",
];

export function registerMetadataCacheHandlers(store: MetadataCacheStore, bus: EventBus): () => void {
  const unsubscribers = [
    bus.subscribe("bookUpdated", (payload: DomainEventMap["bookUpdated"]) => {
      store.applyBookUpdate(payload);
      if (payload.detail) {
        store.set(`book/${payload.book.id}`, "detail", payload.detail);
      } else {
        store.invalidate(`book/${payload.book.id}`);
      }
      if (payload.changedFields.includes("publisher")) {
        store.invalidate("publishers");
      }
      if (payload.changedFields.some((field) => ["authors", "series", "tags", "language"].includes(field))) {
        invalidateFilterOptions(store);
        invalidateAggregateEntityReadModels(store);
      }
    }),
    bus.subscribe("bookCreated", () => {
      store.invalidateBookLists();
      invalidateAggregateEntityReadModels(store);
      invalidateFilterOptions(store);
      store.invalidate("publishers");
    }),
    bus.subscribe("bookDeleted", (payload) => {
      store.invalidateBookLists();
      invalidateAggregateEntityReadModels(store);
      store.invalidate(`book/${payload.bookId}`);
      invalidateFilterOptions(store);
      store.invalidate("publishers");
      store.invalidate("shelves");
      store.invalidate(`book-shelves/${payload.bookId}`);
    }),
    bus.subscribe("shelfMembershipChanged", (payload) => {
      store.applyShelfMembershipChange(payload);
      store.invalidate(`book-shelves/${payload.bookId}`);
      store.invalidate("shelves");
    }),
    bus.subscribe("authorRenamed", (payload) => {
      store.invalidate("authors");
      store.invalidate("filter-options/authors");
      store.invalidate("series");
      invalidateBookDetails(store);
      store.applyAuthorRename(payload);
    }),
    bus.subscribe("authorMerged", (payload) => {
      store.invalidate("authors");
      store.invalidate(`author/${payload.targetId}`);
      store.invalidate(`author/${payload.sourceId}`);
      store.invalidate("series");
      invalidateBookDetails(store);
      store.invalidateBookLists();
      invalidateFilterOptions(store);
    }),
    bus.subscribe("authorDeleted", (payload) => {
      store.invalidate("authors");
      store.invalidate(`author/${payload.authorId}`);
      store.invalidate("series");
      invalidateBookDetails(store);
      store.invalidateBookLists();
      invalidateFilterOptions(store);
    }),
    bus.subscribe("seriesRenamed", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.seriesId}`);
      store.invalidate("filter-options/series");
      invalidateBookDetails(store);
      store.applySeriesRename(payload);
    }),
    bus.subscribe("seriesMerged", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.targetId}`);
      store.invalidate(`series/${payload.sourceId}`);
      invalidateBookDetails(store);
      store.invalidateBookLists();
      invalidateFilterOptions(store);
    }),
    bus.subscribe("seriesDeleted", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.seriesId}`);
      invalidateBookDetails(store);
      store.invalidateBookLists();
      invalidateFilterOptions(store);
    }),
    bus.subscribe("tagMapped", (payload) => {
      store.invalidate("tags");
      store.invalidate(`tag/${payload.tagId}`);
      store.invalidate(`tag/${payload.targetId}`);
      invalidateBookDetails(store);
      store.invalidateBookLists();
      invalidateFilterOptions(store);
    }),
    bus.subscribe("shelfCreated", () => {
      store.invalidate("shelves");
    }),
    bus.subscribe("shelfRenamed", (payload) => {
      store.invalidate("shelves");
      store.applyShelfRename(payload);
    }),
    bus.subscribe("shelfDeleted", (payload) => {
      store.invalidate("shelves");
      store.invalidate(`shelf/${payload.shelfId}`);
      store.invalidateBookLists();
      store.invalidateNamespacePrefix("book-shelves/");
    }),
    bus.subscribe("bookRatingChanged", (payload) => {
      // applyBookUpdate проходит по всем книгосписковым entries; для записей с
      // source=shelf-best классификатор classifyBookUpdateForBookList помечает
      // изменение rating как структурное и удаляет entry. Отдельная инвалидация
      // фиксированного ключа shelf/best не нужна — туда никто не пишет.
      store.applyBookUpdate({ book: { id: payload.bookId, rating: payload.rating }, changedFields: ["rating"] });
      patchCachedBookDetail(store, payload.bookId, { rating: payload.rating });
    }),
    bus.subscribe("bookReadChanged", (payload) => {
      // Аналогично: source=shelf-reading-now + изменение read — структурное
      // удаление через applyBookUpdate. Фиксированный shelf/reading-now мёртв.
      store.applyBookUpdate({ book: { id: payload.bookId, isRead: payload.isRead }, changedFields: ["read"] });
      patchCachedBookDetail(store, payload.bookId, { isRead: payload.isRead });
    }),
    bus.subscribe("bookHiddenChanged", (payload) => {
      store.invalidateBookLists();
      store.invalidate(`book/${payload.bookId}`);
      invalidateAggregateEntityReadModels(store);
      invalidateFilterOptions(store);
    }),
    bus.subscribe("readingProgressChanged", () => {
      store.invalidateNamespacePrefix("shelf/");
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}

function invalidateFilterOptions(store: MetadataCacheStore): void {
  for (const namespace of FILTER_OPTION_NAMESPACES) {
    store.invalidate(namespace);
  }
}

function invalidateAggregateEntityReadModels(store: MetadataCacheStore): void {
  store.invalidate("authors");
  store.invalidate("series");
  store.invalidate("tags");
}

function invalidateBookDetails(store: MetadataCacheStore): void {
  store.invalidateNamespacePrefix("book/");
}

function patchCachedBookDetail(
  store: MetadataCacheStore,
  bookId: number,
  patch: Record<string, unknown>,
): void {
  const namespace = `book/${bookId}`;
  const detail = store.get<{ book?: unknown } & Record<string, unknown>>(namespace, "detail");
  if (!isCachedBookDetailFor(detail, bookId)) return;
  store.set(namespace, "detail", {
    ...detail,
    book: { ...detail.book, ...patch },
  });
}

function isCachedBookDetailFor(
  detail: ({ book?: unknown } & Record<string, unknown>) | undefined,
  bookId: number,
): detail is { book: { id: number } & Record<string, unknown> } & Record<string, unknown> {
  return typeof detail === "object"
    && detail !== null
    && typeof detail.book === "object"
    && detail.book !== null
    && (detail.book as { id?: unknown }).id === bookId;
}
