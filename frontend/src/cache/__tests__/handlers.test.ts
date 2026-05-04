import { beforeEach, describe, expect, it } from "vitest";
import { domainEvents } from "@/domain/events";
import { MetadataCacheStore } from "../store";
import { registerMetadataCacheHandlers } from "../handlers";

describe("metadata cache handlers", () => {
  let store: MetadataCacheStore;

  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
    store = new MetadataCacheStore();
    registerMetadataCacheHandlers(store, domainEvents);
  });

  it("patches book rows for patchable book update across namespaces", () => {
    store.set("books", "catalog-added", { books: [{ id: 1, title: "Old" }], hasMore: false }, {
      context: { kind: "book-list", key: "catalog-added", source: "author-detail", authorId: 2, sort: "addedDesc" },
    });
    store.set("author/2", "detail", { books: [{ id: 1, title: "Old" }], hasMore: false }, {
      context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" },
    });
    store.set("series/3", "detail", { books: [{ id: 1, title: "Old" }], hasMore: false }, {
      context: { kind: "book-list", key: "series/3", source: "series-detail", seriesId: 3, sort: "seriesNumber" },
    });

    domainEvents.publish("bookUpdated", {
      book: { id: 1, title: "New" },
      changedFields: ["description"],
    });

    expect(store.get<{ books: { title: string }[] }>("books", "catalog-added")?.books[0].title).toBe("New");
    expect(store.get<{ books: { title: string }[] }>("author/2", "detail")?.books[0].title).toBe("New");
    expect(store.get<{ books: { title: string }[] }>("series/3", "detail")?.books[0].title).toBe("New");
  });

  it("invalidates structurally affected book list entries", () => {
    store.set("books", "catalog-title", { books: [{ id: 1, title: "Old" }], hasMore: false }, {
      context: { kind: "book-list", key: "catalog-title", source: "catalog", sort: "titleAsc" },
    });

    domainEvents.publish("bookUpdated", {
      book: { id: 1, title: "New" },
      changedFields: ["title"],
    });

    expect(store.get("books", "catalog-title")).toBeUndefined();
  });

  it("stores fresh book detail and invalidates publishers when publisher changes", () => {
    store.set("publishers", "all", { publishers: ["A"] });

    domainEvents.publish("bookUpdated", {
      book: { id: 1, title: "Book" },
      detail: {
        book: { id: 1, title: "Book" } as never,
        files: [],
        identifiers: [],
      },
      changedFields: ["publisher"],
    });

    expect(store.get("publishers", "all")).toBeUndefined();
    expect(store.get("book/1", "detail")).toEqual({
      book: { id: 1, title: "Book" },
      files: [],
      identifiers: [],
    });
  });

  it("patches rating and read changes into cached book detail without invalidating it", () => {
    store.set("books", "rating", { books: [{ id: 10, rating: 1, isRead: false }], hasMore: false }, {
      context: { kind: "book-list", key: "rating", source: "catalog", sort: "addedDesc" },
    });
    store.set("book/10", "detail", {
      book: { id: 10, rating: 1, isRead: false },
      files: [],
      identifiers: [],
    });
    store.set("shelf/best", "default", { books: [{ id: 10 }], hasMore: false });

    domainEvents.publish("bookRatingChanged", { bookId: 10, rating: 5 });

    expect(store.get<{ books: { rating: number }[] }>("books", "rating")?.books[0].rating).toBe(5);
    expect(store.get<{ book: { rating: number | null; isRead: boolean } }>("book/10", "detail")?.book).toMatchObject({
      id: 10,
      rating: 5,
      isRead: false,
    });
    expect(store.get("shelf/best", "default")).toBeUndefined();

    store.set("shelf/reading-now", "default", { books: [{ id: 10 }], hasMore: false });
    domainEvents.publish("bookReadChanged", { bookId: 10, isRead: true });

    expect(store.get<{ books: { isRead: boolean }[] }>("books", "rating")?.books[0].isRead).toBe(true);
    expect(store.get<{ book: { rating: number | null; isRead: boolean } }>("book/10", "detail")?.book).toMatchObject({
      id: 10,
      rating: 5,
      isRead: true,
    });
    expect(store.get("shelf/reading-now", "default")).toBeUndefined();
  });

  it("invalidates stale book detail when book update has no fresh detail", () => {
    store.set("book/1", "detail", { book: { id: 1, title: "Old" }, files: [], identifiers: [] });

    domainEvents.publish("bookUpdated", {
      book: { id: 1, title: "New" },
      changedFields: ["title"],
    });

    expect(store.get("book/1", "detail")).toBeUndefined();
  });

  it("invalidates books on create and delete", () => {
    store.set("books", "catalog-added", { books: [{ id: 1 }], hasMore: false });
    store.set("series", "/series", { series: [{ id: 1, bookCount: 1 }] });
    store.set("tags", "cloud?top=30", { tags: [{ id: 1, bookCount: 1 }] });
    domainEvents.publish("bookCreated", { bookId: 2 });
    expect(store.get("books", "catalog-added")).toBeUndefined();
    expect(store.get("series", "/series")).toBeUndefined();
    expect(store.get("tags", "cloud?top=30")).toBeUndefined();

    store.set("books", "catalog-added", { books: [{ id: 1 }], hasMore: false });
    store.set("series", "/series", { series: [{ id: 1, bookCount: 1 }] });
    store.set("tags", "cloud?top=30", { tags: [{ id: 1, bookCount: 1 }] });
    store.set("author/1", "detail", { books: [{ id: 1 }], hasMore: false }, {
      context: { kind: "book-list", key: "author/1", source: "author-detail", authorId: 1, sort: "addedDesc" },
    });
    store.set("book/1", "detail", { book: { id: 1 } });
    store.set("book-shelves/1", "all", { shelves: [{ id: 1 }] });
    domainEvents.publish("bookDeleted", { bookId: 1 });
    expect(store.get("books", "catalog-added")).toBeUndefined();
    expect(store.get("series", "/series")).toBeUndefined();
    expect(store.get("tags", "cloud?top=30")).toBeUndefined();
    expect(store.get("author/1", "detail")).toBeUndefined();
    expect(store.get("book/1", "detail")).toBeUndefined();
    expect(store.get("book-shelves/1", "all")).toBeUndefined();
  });

  it("invalidates aggregate entity read models after membership-changing book updates", () => {
    store.set("series", "/series", { series: [{ id: 1, bookCount: 1 }] });
    store.set("tags", "cloud?top=30", { tags: [{ id: 1, bookCount: 1 }] });

    domainEvents.publish("bookUpdated", {
      book: { id: 1 },
      changedFields: ["authors", "tags"],
    });

    expect(store.get("series", "/series")).toBeUndefined();
    expect(store.get("tags", "cloud?top=30")).toBeUndefined();
  });

  it("invalidates cached book details after entity metadata changes", () => {
    store.set("book/1", "detail", {
      book: { id: 1, authors: [{ id: 7, name: "Old" }] },
      files: [],
      identifiers: [],
    });
    domainEvents.publish("authorRenamed", { authorId: 7, name: "New" });
    expect(store.get("book/1", "detail")).toBeUndefined();

    store.set("book/1", "detail", {
      book: { id: 1, series: { id: 3, name: "Old" } },
      files: [],
      identifiers: [],
    });
    domainEvents.publish("seriesRenamed", { seriesId: 3, name: "New" });
    expect(store.get("book/1", "detail")).toBeUndefined();

    store.set("book/1", "detail", {
      book: { id: 1, tags: [{ id: 5, name: "Old" }] },
      files: [],
      identifiers: [],
    });
    domainEvents.publish("tagMapped", { tagId: 5, targetId: 6, name: "Mapped" });
    expect(store.get("book/1", "detail")).toBeUndefined();
  });

  it("invalidates shelves summary on shelf membership changes", () => {
    store.set("shelves", "all", { shelves: [{ id: 3, bookCount: 1 }] });
    store.set("shelf/3", "detail", { shelf: { id: 3 }, books: [{ id: 10 }] });
    store.set("book-shelves/10", "all", { shelves: [{ id: 3 }] });

    domainEvents.publish("shelfMembershipChanged", { shelfId: 3, bookId: 10, hasBook: false });

    expect(store.get("shelves", "all")).toBeUndefined();
    expect(store.get("shelf/3", "detail")).toBeUndefined();
    expect(store.get("book-shelves/10", "all")).toBeUndefined();
  });

  it("handles author, series, tag, shelf, rating, read, and progress events", () => {
    store.set("filter-options/authors", "all", { authors: [{ id: 1, name: "Old" }] });
    store.set("filter-options/series", "all", { series: [{ id: 2, name: "Old" }] });
    store.set("filter-options/tags", "all", { tags: [{ id: 3, name: "Old" }] });
    store.set("filter-options/tags", "authors=1", { tags: [{ id: 4, name: "Author Tag" }] });
    store.set("author/1", "detail", { author: { id: 1, name: "Old" } });
    store.set("series/2", "detail", { series: { id: 2, name: "Old" } });
    store.set("search", "old-series", { books: [{ id: 20, series: { id: 2, name: "Old" } }], hasMore: false }, {
      context: { kind: "book-list", key: "old-series", source: "search", sort: "addedDesc", query: "Old" },
    });
    store.set("tag/3", "detail", { tag: { id: 3, name: "Old" } });
    store.set("shelf/4", "detail", { shelf: { id: 4, name: "Shelf" } });
    store.set("shelves", "all", { shelves: [{ id: 4, name: "Shelf" }] });
    store.set("books", "rating", { books: [{ id: 10, rating: 1, isRead: false }], hasMore: false }, {
      context: { kind: "book-list", key: "rating", source: "catalog", sort: "addedDesc" },
    });
    store.set("books", "author-sorted", { books: [{ id: 11, authors: [{ id: 1, name: "Old" }] }], hasMore: false }, {
      context: { kind: "book-list", key: "author-sorted", source: "catalog", sort: "authorAsc" },
    });
    store.set("books", "safe-author-row", { books: [{ id: 12, authors: [{ id: 1, name: "Old" }] }], hasMore: false }, {
      context: { kind: "book-list", key: "safe-author-row", source: "catalog", sort: "addedDesc" },
    });

    domainEvents.publish("authorRenamed", { authorId: 1, name: "New" });
    expect(store.get("filter-options/authors", "all")).toBeUndefined();
    expect(store.get("author/1", "detail")).toBeUndefined();
    expect(store.get("books", "author-sorted")).toBeUndefined();
    expect(store.get<{ books: { authors: { name: string }[] }[] }>("books", "safe-author-row")?.books[0].authors[0].name).toBe("New");

    store.set("tag/1", "detail", { books: [{ id: 12, authors: [{ id: 1, name: "New" }] }], hasMore: false }, {
      context: { kind: "book-list", key: "tag/1", source: "tag-detail", tagId: 1, sort: "addedDesc" },
    });
    domainEvents.publish("authorDeleted", { authorId: 1 });
    expect(store.get("tag/1", "detail")).toBeUndefined();
    expect(store.get("filter-options/tags", "authors=1")).toBeUndefined();

    domainEvents.publish("seriesRenamed", { seriesId: 2, name: "New" });
    expect(store.get("filter-options/series", "all")).toBeUndefined();
    expect(store.get("series/2", "detail")).toBeUndefined();
    expect(store.get("search", "old-series")).toBeUndefined();

    store.set("author/2", "series-books", { books: [{ id: 20, series: { id: 2, name: "New" } }], hasMore: false }, {
      context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" },
    });
    domainEvents.publish("seriesDeleted", { seriesId: 2 });
    expect(store.get("author/2", "series-books")).toBeUndefined();

    store.set("series/9", "tag-books", { books: [{ id: 21, tags: [{ id: 3, name: "Old" }] }], hasMore: false }, {
      context: { kind: "book-list", key: "series/9", source: "series-detail", seriesId: 9, sort: "seriesNumber" },
    });
    domainEvents.publish("tagMapped", { tagId: 3, targetId: 9, name: "Mapped" });
    expect(store.get("filter-options/tags", "all")).toBeUndefined();
    expect(store.get("tag/3", "detail")).toBeUndefined();
    expect(store.get("series/9", "tag-books")).toBeUndefined();

    domainEvents.publish("shelfCreated", { shelfId: 5, name: "New shelf" });
    expect(store.get("shelves", "all")).toBeUndefined();

    store.set("shelf/4", "detail", { shelf: { id: 4, name: "Shelf" } });
    domainEvents.publish("shelfRenamed", { shelfId: 4, name: "Renamed" });
    expect(store.get("shelf/4", "detail")).toBeUndefined();

    store.set("books", "rating", { books: [{ id: 10, rating: 1, isRead: false }], hasMore: false }, {
      context: { kind: "book-list", key: "rating", source: "catalog", sort: "addedDesc" },
    });
    store.set("book/10", "detail", { book: { id: 10, rating: 1, isRead: false }, files: [], identifiers: [] });
    domainEvents.publish("bookRatingChanged", { bookId: 10, rating: 5 });
    expect(store.get<{ books: { rating: number }[] }>("books", "rating")?.books[0].rating).toBe(5);
    expect(store.get<{ book: { rating: number } }>("book/10", "detail")?.book.rating).toBe(5);

    store.set("book/10", "detail", { book: { id: 10, rating: 5, isRead: false }, files: [], identifiers: [] });
    domainEvents.publish("bookReadChanged", { bookId: 10, isRead: true });
    expect(store.get<{ books: { isRead: boolean }[] }>("books", "rating")?.books[0].isRead).toBe(true);
    expect(store.get<{ book: { isRead: boolean } }>("book/10", "detail")?.book.isRead).toBe(true);

    store.set("shelf/reading-now", "default", { books: [{ id: 10 }], hasMore: false });
    store.set("shelf/2", "/shelves/2?sort=lastReadDesc", { books: [{ id: 10, fraction: 0.2 }], hasMore: false }, {
      context: {
        kind: "book-list",
        key: "/shelves/2?sort=lastReadDesc",
        source: "shelf-reading-now",
        shelfId: 2,
        sort: "lastReadDesc",
      },
    });
    store.set("shelf/7", "/shelves/7", { books: [{ id: 10, fraction: 0.1 }], hasMore: false });
    domainEvents.publish("readingProgressChanged", {
      bookId: 10,
      hadPosition: false,
      hasPosition: true,
      lastReadAtChanged: true,
    });
    expect(store.get("shelf/reading-now", "default")).toBeUndefined();
    expect(store.get("shelf/2", "/shelves/2?sort=lastReadDesc")).toBeUndefined();
    expect(store.get("shelf/7", "/shelves/7")).toBeUndefined();
  });

  it("invalidates shelf namespaces and book-shelves prefixes on shelf delete", () => {
    store.set("shelves", "all", { shelves: [{ id: 4 }] });
    store.set("shelf/4", "detail", { shelf: { id: 4 } });
    store.set("book-shelves/10", "all", { shelves: [{ id: 4 }] });

    domainEvents.publish("shelfDeleted", { shelfId: 4 });

    expect(store.get("shelves", "all")).toBeUndefined();
    expect(store.get("shelf/4", "detail")).toBeUndefined();
    expect(store.get("book-shelves/10", "all")).toBeUndefined();
  });

  it("invalidates hidden-filtered read models on hidden-state changes", () => {
    store.set("books", "catalog", { books: [{ id: 7 }], hasMore: false });
    store.set("authors", "all", { authors: [{ id: 1, bookCount: 1 }] });
    store.set("series", "all", { series: [{ id: 2, bookCount: 1 }] });
    store.set("tags", "cloud?top=30", { tags: [{ id: 3, bookCount: 1 }] });
    store.set("filter-options/authors", "all", { authors: [{ id: 1 }] });
    store.set("filter-options/series", "all", { series: [{ id: 2 }] });
    store.set("filter-options/tags", "all", { tags: [{ id: 3 }] });
    store.set("filter-options/languages", "all", { languages: [{ value: "ru" }] });

    domainEvents.publish("bookHiddenChanged", { bookId: 7, isHidden: true });

    expect(store.get("books", "catalog")).toBeUndefined();
    expect(store.get("authors", "all")).toBeUndefined();
    expect(store.get("series", "all")).toBeUndefined();
    expect(store.get("tags", "cloud?top=30")).toBeUndefined();
    expect(store.get("filter-options/authors", "all")).toBeUndefined();
    expect(store.get("filter-options/series", "all")).toBeUndefined();
    expect(store.get("filter-options/tags", "all")).toBeUndefined();
    expect(store.get("filter-options/languages", "all")).toBeUndefined();
  });
});
