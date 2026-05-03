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
      }
    }),
    bus.subscribe("bookCreated", () => {
      store.invalidateBookLists();
      invalidateFilterOptions(store);
      store.invalidate("publishers");
    }),
    bus.subscribe("bookDeleted", (payload) => {
      store.invalidateBookLists();
      store.invalidate(`book/${payload.bookId}`);
      invalidateFilterOptions(store);
      store.invalidate("publishers");
      store.invalidate("shelves");
      store.invalidate(`book-shelves/${payload.bookId}`);
    }),
    bus.subscribe("shelfMembershipChanged", (payload) => {
      store.invalidate(`shelf/${payload.shelfId}`);
      store.invalidate(`book-shelves/${payload.bookId}`);
      store.invalidate("shelves");
    }),
    bus.subscribe("authorRenamed", (payload) => {
      store.invalidate("authors");
      store.invalidate(`author/${payload.authorId}`);
      store.invalidate("filter-options/authors");
      store.applyAuthorRename(payload);
    }),
    bus.subscribe("authorMerged", (payload) => {
      store.invalidate("authors");
      store.invalidate(`author/${payload.targetId}`);
      store.invalidate(`author/${payload.sourceId}`);
      store.invalidateBookLists();
      store.invalidate("filter-options/authors");
    }),
    bus.subscribe("authorDeleted", (payload) => {
      store.invalidate("authors");
      store.invalidate(`author/${payload.authorId}`);
      store.invalidateBookLists();
      store.invalidate("filter-options/authors");
    }),
    bus.subscribe("seriesRenamed", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.seriesId}`);
      store.invalidate("filter-options/series");
      store.applySeriesRename(payload);
    }),
    bus.subscribe("seriesMerged", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.targetId}`);
      store.invalidate(`series/${payload.sourceId}`);
      store.invalidateBookLists();
      store.invalidate("filter-options/series");
    }),
    bus.subscribe("seriesDeleted", (payload) => {
      store.invalidate("series");
      store.invalidate(`series/${payload.seriesId}`);
      store.invalidateBookLists();
      store.invalidate("filter-options/series");
    }),
    bus.subscribe("tagMapped", (payload) => {
      store.invalidate("tags");
      store.invalidate(`tag/${payload.tagId}`);
      store.invalidate(`tag/${payload.targetId}`);
      store.invalidateBookLists();
      store.invalidate("filter-options/tags");
    }),
    bus.subscribe("shelfCreated", () => {
      store.invalidate("shelves");
    }),
    bus.subscribe("shelfRenamed", (payload) => {
      store.invalidate("shelves");
      store.invalidate(`shelf/${payload.shelfId}`);
    }),
    bus.subscribe("shelfDeleted", (payload) => {
      store.invalidate("shelves");
      store.invalidate(`shelf/${payload.shelfId}`);
      store.invalidateBookLists();
      store.invalidateNamespacePrefix("book-shelves/");
    }),
    bus.subscribe("bookRatingChanged", (payload) => {
      store.applyBookUpdate({ book: { id: payload.bookId, rating: payload.rating }, changedFields: ["rating"] });
      store.invalidate(`book/${payload.bookId}`);
      store.invalidate("shelf/best");
    }),
    bus.subscribe("bookReadChanged", (payload) => {
      store.applyBookUpdate({ book: { id: payload.bookId, isRead: payload.isRead }, changedFields: ["read"] });
      store.invalidate(`book/${payload.bookId}`);
      store.invalidate("shelf/reading-now");
    }),
    bus.subscribe("readingProgressChanged", () => {
      store.invalidate("shelf/reading-now");
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
