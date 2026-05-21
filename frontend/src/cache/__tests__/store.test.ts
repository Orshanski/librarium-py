import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataCacheStore } from "../store";

describe("MetadataCacheStore", () => {
  let store: MetadataCacheStore;

  beforeEach(() => {
    store = new MetadataCacheStore();
    sessionStorage.clear();
  });

  it("stores and reads entries by namespace and key", () => {
    store.set("books", "/api/books?sort=addedDesc", { books: [{ id: 1 }] });

    expect(store.get("books", "/api/books?sort=addedDesc")).toEqual({ books: [{ id: 1 }] });
    expect(store.get("books", "/api/books?sort=titleAsc")).toBeUndefined();
  });

  it("notifies namespace subscribers on set and invalidate", () => {
    const handler = vi.fn();
    store.subscribe("books", handler);

    store.set("books", "k1", { books: [] });
    store.invalidate("books");

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribers that were present when notification started", () => {
    let unsubscribeSecond = () => {};
    const second = vi.fn();
    const first = vi.fn(() => {
      unsubscribeSecond();
    });
    store.subscribe("books", first);
    unsubscribeSecond = store.subscribe("books", second);

    store.set("books", "k1", { books: [] });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("patches matching book rows inside the books namespace", () => {
    store.set("books", "k1", {
      books: [{ id: 1, title: "Old" }, { id: 2, title: "Other" }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "k1", source: "catalog", sort: "addedDesc" } });

    store.patchBookRow({ id: 1, title: "New" });

    expect(store.get<{ books: { id: number; title: string }[] }>("books", "k1")?.books[0].title).toBe("New");
    expect(store.get<{ books: { id: number; title: string }[] }>("books", "k1")?.books[1].title).toBe("Other");
  });

  it("patches matching book rows across hydrated and persisted namespaces", () => {
    store.set("author/2", "detail", {
      books: [{ id: 1, title: "Old" }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" } });
    sessionStorage.setItem(
      "librarium_metadata_cache_tag/1",
      JSON.stringify({
        detail: {
          value: { books: [{ id: 1, title: "Old" }], hasMore: false },
          context: { kind: "book-list", key: "tag/1", source: "tag-detail", tagId: 1, sort: "addedDesc" },
        },
      }),
    );

    store.patchBookRow({ id: 1, title: "New" });

    expect(store.get<{ books: { title: string }[] }>("author/2", "detail")?.books[0].title).toBe("New");
    expect(store.get<{ books: { title: string }[] }>("tag/1", "detail")?.books[0].title).toBe("New");
  });

  it("patches matching book rows with a predicate across namespaces", () => {
    store.set("series/3", "detail", {
      books: [{ id: 1, rating: 1 }, { id: 2, rating: 2 }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "series/3", source: "series-detail", seriesId: 3, sort: "seriesNumber" } });

    store.patchBookRowsWhere(
      (row) => row.id === 2,
      (row) => ({ ...row, rating: 5 }),
    );

    expect(store.get<{ books: { rating: number }[] }>("series/3", "detail")?.books[1].rating).toBe(5);
  });

  it("invalidates structural book list entries while patching valid entries", () => {
    store.set("books", "catalog-title", {
      books: [{ id: 1, title: "Old" }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "catalog-title", source: "catalog", sort: "titleAsc" } });
    store.set("author/2", "detail", {
      books: [{ id: 1, title: "Old" }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" } });

    store.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["title"] });

    expect(store.get("books", "catalog-title")).toBeUndefined();
    expect(store.get<{ books: { title: string }[] }>("author/2", "detail")?.books[0].title).toBe("New");
  });

  it("invalidates contextless book list entries instead of guessing patch safety", () => {
    store.set("books", "legacy", { books: [{ id: 1, title: "Old" }], hasMore: false });

    store.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["title"] });

    expect(store.get("books", "legacy")).toBeUndefined();
  });

  it("updates an existing entry context for later structural classification", () => {
    store.set("shelf/7", "detail", {
      books: [{ id: 1, title: "Old", isRead: false }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "shelf/7", source: "shelf-regular", shelfId: 7, sort: "addedDesc" } });

    store.updateContext("shelf/7", "detail", {
      kind: "book-list",
      key: "shelf/7",
      source: "shelf-reading-now",
      shelfId: 7,
      sort: "lastReadDesc",
    });
    store.applyBookUpdate({ book: { id: 1, isRead: true }, changedFields: ["read"] });

    expect(store.get("shelf/7", "detail")).toBeUndefined();
  });

  it("updates book-list-shaped detail namespace entries with context", () => {
    store.set("author/2", "detail", {
      books: [{ id: 1, title: "Old" }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" } });

    store.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["description"] });

    expect(store.get<{ books: { title: string }[] }>("author/2", "detail")?.books[0].title).toBe("New");
  });

  it("applies author renames across book-list-shaped entries and invalidates sorted entries", () => {
    store.set("books", "author-sorted", {
      books: [{ id: 1, authors: [{ id: 7, name: "Old" }] }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "author-sorted", source: "catalog", sort: "authorAsc" } });
    store.set("tag/1", "detail", {
      books: [{ id: 1, authors: [{ id: 7, name: "Old" }] }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "tag/1", source: "tag-detail", tagId: 1, sort: "addedDesc" } });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get("books", "author-sorted")).toBeUndefined();
    expect(store.get<{ books: { authors: { name: string; sortName: string }[] }[] }>("tag/1", "detail")?.books[0].authors[0]).toEqual({
      id: 7,
      name: "New",
      sortName: "New",
    });
  });

  it("preserves existing sortName when rename event omits canonical sortName", () => {
    store.set("tag/1", "detail", {
      books: [{ id: 1, authors: [{ id: 7, name: "Old", sortName: "Old Sort" }], series: { id: 9, name: "Series", sortName: "Series Sort" } }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "tag/1", source: "tag-detail", tagId: 1, sort: "addedDesc" } });

    store.applyAuthorRename({ authorId: 7, name: "New" });
    store.applySeriesRename({ seriesId: 9, name: "New Series" });

    const row = store.get<{ books: { authors: { sortName?: string }[]; series: { sortName?: string } }[] }>("tag/1", "detail")?.books[0];
    expect(row?.authors[0].sortName).toBe("Old Sort");
    expect(row?.series.sortName).toBe("Series Sort");
  });

  it("persists and hydrates namespace entries from sessionStorage", () => {
    store.set("authors", "/authors", { authors: [{ id: 1, name: "Frank Herbert" }] });

    const hydrated = new MetadataCacheStore();

    expect(hydrated.get("authors", "/authors")).toEqual({ authors: [{ id: 1, name: "Frank Herbert" }] });
  });

  it("applies book updates to persisted namespaces that were not touched yet", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_author/2",
      JSON.stringify({
        detail: {
          value: { books: [{ id: 1, title: "Old" }], hasMore: false },
          context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["description"] });

    expect(hydrated.get<{ books: { title: string }[] }>("author/2", "detail")?.books[0].title).toBe("New");
  });

  it("drops malformed persisted entries instead of crashing on updates", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_books",
      JSON.stringify({
        broken: null,
        valid: { value: { books: [{ id: 1, title: "Old" }], hasMore: false } },
      }),
    );
    const hydrated = new MetadataCacheStore();

    expect(() => hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["title"] })).not.toThrow();

    expect(hydrated.get("books", "broken")).toBeUndefined();
    expect(hydrated.get("books", "valid")).toBeUndefined();
  });

  it("drops malformed persisted book-list rows instead of crashing on updates", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_books",
      JSON.stringify({
        malformed: {
          value: { books: [null], hasMore: false },
          context: { kind: "book-list", key: "books", source: "catalog", sort: "addedDesc" },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    expect(() => hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["description"] })).not.toThrow();
    expect(hydrated.get("books", "malformed")).toBeUndefined();
  });

  it("treats malformed persisted context as contextless and invalidates conservatively", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_books",
      JSON.stringify({
        malformed: {
          value: { books: [{ id: 1, title: "Old" }], hasMore: false },
          context: { kind: "book-list", key: "books", source: "catalog", sort: "unknownSort" },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["description"] });

    expect(hydrated.get("books", "malformed")).toBeUndefined();
  });

  it("treats malformed persisted source-specific context as contextless", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_author/2",
      JSON.stringify({
        detail: {
          value: { books: [{ id: 1, title: "Old" }], hasMore: false },
          context: { kind: "book-list", key: "author/2", source: "author-detail", sort: "addedDesc", filters: { authorIds: "bad" } },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["authors"], affected: { authorIds: [2] } });

    expect(hydrated.get("author/2", "detail")).toBeUndefined();
  });

  it("treats persisted context with source-specific extras as contextless", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_books",
      JSON.stringify({
        catalog: {
          value: { books: [{ id: 1, title: "Old" }], hasMore: false },
          context: { kind: "book-list", key: "catalog", source: "catalog", sort: "addedDesc", authorId: 999 },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["authors"], affected: { authorIds: [1] } });

    expect(hydrated.get("books", "catalog")).toBeUndefined();
  });

  it("clear preserves subscribers and notifies affected namespaces", () => {
    store.set("books", "k1", { books: [{ id: 1 }], hasMore: false });
    const handler = vi.fn();
    store.subscribe("books", handler);

    store.clear();
    store.set("books", "k2", { books: [{ id: 2 }], hasMore: false });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("clears only metadata cache sessionStorage keys", () => {
    sessionStorage.setItem("librarium_metadata_cache_books", "{}");
    sessionStorage.setItem("librarium_scroll_state", "[]");

    store.clear();

    expect(sessionStorage.getItem("librarium_metadata_cache_books")).toBeNull();
    expect(sessionStorage.getItem("librarium_scroll_state")).toBe("[]");
  });

  it("applyShelfMembershipChange remove-case фильтрует книгу из массива", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }],
    });

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    const result = store.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42");
    expect(result?.books).toHaveLength(1);
    expect(result?.books[0].id).toBe(2);
  });

  it("applyShelfMembershipChange add-case с book добавляет карточку", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }],
    });

    store.applyShelfMembershipChange({
      shelfId: 42,
      bookId: 3,
      hasBook: true,
      book: { id: 3, title: "Book C", authors: [], series: null, seriesNumber: null, coverPath: "", rating: null, isRead: false },
    });

    const result = store.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42");
    expect(result?.books).toHaveLength(2);
    expect(result?.books[1].id).toBe(3);
  });

  it("applyShelfMembershipChange add-case dedup при повторном применении (длина массива не меняется)", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }],
    });
    const book = { id: 3, title: "Book C", authors: [], series: null, seriesNumber: null, coverPath: "", rating: null, isRead: false };

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 3, hasBook: true, book });
    store.applyShelfMembershipChange({ shelfId: 42, bookId: 3, hasBook: true, book });

    const result = store.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42");
    expect(result?.books).toHaveLength(2);
  });

  it("applyShelfMembershipChange add-case без book инвалидирует запись полки", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }],
    });

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 3, hasBook: true });

    expect(store.get("shelf/42", "/api/shelves/42")).toBeUndefined();
  });

  it("applyShelfMembershipChange не трогает другие namespaces", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "Shelf 42" },
      books: [{ id: 1, title: "Book A" }],
    });
    store.set("shelf/43", "/api/shelves/43", {
      shelf: { id: 43, name: "Shelf 43" },
      books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }],
    });

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    const other = store.get<{ books: { id: number }[] }>("shelf/43", "/api/shelves/43");
    expect(other?.books).toHaveLength(2);
  });

  it("applyShelfMembershipChange обновляет все entries под разными URL-ключами в одном namespace", () => {
    store.set("shelf/42", "/api/shelves/42?sort=addedDesc", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }],
    });
    store.set("shelf/42", "/api/shelves/42?sort=titleAsc", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }],
    });

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    const entry1 = store.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42?sort=addedDesc");
    const entry2 = store.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42?sort=titleAsc");
    expect(entry1?.books).toHaveLength(1);
    expect(entry2?.books).toHaveLength(1);
  });

  it("applyShelfMembershipChange сохраняет в sessionStorage после правки", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }],
    });

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    const raw = sessionStorage.getItem("librarium_metadata_cache_shelf/42");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, { value: { books: { id: number }[] } }>;
    expect(parsed["/api/shelves/42"].value.books).toHaveLength(1);
    expect(parsed["/api/shelves/42"].value.books[0].id).toBe(2);
  });

  it("applyShelfRename обновляет shelf.name во всех записях namespace", () => {
    store.set("shelf/42", "/api/shelves/42?sort=addedDesc", {
      shelf: { id: 42, name: "Old Name" },
      books: [{ id: 1, title: "Book A" }],
    });
    // Запись без поля books (например, другой shape)
    store.set("shelf/42", "/api/shelves/42/meta", {
      shelf: { id: 42, name: "Old Name" },
    });

    store.applyShelfRename({ shelfId: 42, name: "New Name" });

    const entry1 = store.get<{ shelf: { name: string } }>("shelf/42", "/api/shelves/42?sort=addedDesc");
    const entry2 = store.get<{ shelf: { name: string } }>("shelf/42", "/api/shelves/42/meta");
    expect(entry1?.shelf.name).toBe("New Name");
    expect(entry2?.shelf.name).toBe("New Name");
  });

  it("applyShelfRename не трогает другие namespaces", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "Shelf 42" },
      books: [],
    });
    store.set("shelf/43", "/api/shelves/43", {
      shelf: { id: 43, name: "Shelf 43" },
      books: [],
    });

    store.applyShelfRename({ shelfId: 42, name: "Renamed" });

    const other = store.get<{ shelf: { name: string } }>("shelf/43", "/api/shelves/43");
    expect(other?.shelf.name).toBe("Shelf 43");
  });
});
