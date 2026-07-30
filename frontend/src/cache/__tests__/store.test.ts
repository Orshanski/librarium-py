import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataCacheStore } from "../store";
import type { BookListContext } from "@/domain/read-models";

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

  it("does not notify or bump version for no-op book-list rename patches", () => {
    const store = new MetadataCacheStore();
    const subscriber = vi.fn();
    store.set("author/2", "detail", {
      books: [{ id: 1, title: "Book", authors: [{ id: 7, name: "Old" }] }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "author/2", source: "author-detail", authorId: 2, sort: "addedDesc" } });
    store.subscribe("author/2", subscriber);

    store.applyAuthorRename({ authorId: 99, name: "Missing" });

    expect(subscriber).not.toHaveBeenCalled();
  });

  it("derives sortName in book-list refs when rename event omits canonical sortName", () => {
    store.set("tag/1", "detail", {
      books: [{ id: 1, authors: [{ id: 7, name: "Old", sortName: "Old Sort" }], series: { id: 9, name: "Series", sortName: "Series Sort" } }],
      hasMore: false,
    }, { context: { kind: "book-list", key: "tag/1", source: "tag-detail", tagId: 1, sort: "addedDesc" } });

    store.applyAuthorRename({ authorId: 7, name: "New" });
    store.applySeriesRename({ seriesId: 9, name: "New Series" });

    const row = store.get<{ books: { authors: { sortName?: string }[]; series: { sortName?: string } }[] }>("tag/1", "detail")?.books[0];
    expect(row?.authors[0].sortName).toBe("New");
    expect(row?.series.sortName).toBe("New Series");
  });

  const authorSevenContext: BookListContext = {
    kind: "book-list",
    key: "/authors/7",
    source: "author-detail",
    authorId: 7,
    sort: "authorAsc",
  };
  const authorEightContext: BookListContext = {
    kind: "book-list",
    key: "/authors/8",
    source: "author-detail",
    authorId: 8,
    sort: "authorAsc",
  };

  it("applyAuthorRename patches author detail namespace", () => {
    const store = new MetadataCacheStore();
    store.set("author/7", "detail", { author: { id: 7, name: "Old", sortName: "Old", bookCount: 3 } });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get<{ author: unknown }>("author/7", "detail")?.author).toEqual({
      id: 7,
      name: "New",
      sortName: "New",
      bookCount: 3,
    });
  });

  it("applyAuthorRename обновляет author.name и author.sortName в записи детали", () => {
    store.set("author/7", "detail", {
      author: { id: 7, name: "Old", sortName: "Old Sort" },
      books: [],
    }, { context: authorSevenContext });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New Sort" });

    const entry = store.get<{ author: { id: number; name: string; sortName: string } }>("author/7", "detail");
    expect(entry).not.toBeUndefined();
    expect(entry?.author.name).toBe("New");
    expect(entry?.author.sortName).toBe("New Sort");
  });

  it("applyAuthorRename derives author sortName when it is absent from payload", () => {
    store.set("author/7", "detail", {
      author: { id: 7, name: "Old", sortName: "Old Sort" },
      books: [],
    }, { context: authorSevenContext });

    store.applyAuthorRename({ authorId: 7, name: "New Author" });

    const entry = store.get<{ author: { sortName?: string } }>("author/7", "detail");
    expect(entry?.author.sortName).toBe("Author, New");
  });

  it("applyAuthorRename не трогает записи других авторов", () => {
    store.set("author/7", "detail", {
      author: { id: 7, name: "Old" },
      books: [],
    }, { context: authorSevenContext });
    store.set("author/8", "detail", {
      author: { id: 8, name: "Untouched" },
      books: [],
    }, { context: authorEightContext });

    store.applyAuthorRename({ authorId: 7, name: "New" });

    const other = store.get<{ author: { name: string } }>("author/8", "detail");
    expect(other?.author.name).toBe("Untouched");
  });

  const seriesNineContext: BookListContext = {
    kind: "book-list",
    key: "/series/9",
    source: "series-detail",
    seriesId: 9,
    sort: "seriesNumber",
  };
  const seriesTenContext: BookListContext = {
    kind: "book-list",
    key: "/series/10",
    source: "series-detail",
    seriesId: 10,
    sort: "seriesNumber",
  };

  it("applySeriesRename patches series detail namespace", () => {
    const store = new MetadataCacheStore();
    store.set("series/9", "detail", { series: { id: 9, name: "Old", sortName: "Old", bookCount: 2 } });

    store.applySeriesRename({ seriesId: 9, name: "New", sortName: "New" });

    expect(store.get<{ series: unknown }>("series/9", "detail")?.series).toEqual({
      id: 9,
      name: "New",
      sortName: "New",
      bookCount: 2,
    });
  });

  it("applySeriesRename обновляет series.name и series.sortName в записи детали", () => {
    store.set("series/9", "detail", {
      series: { id: 9, name: "Old", sortName: "Old Sort" },
      books: [],
    }, { context: seriesNineContext });

    store.applySeriesRename({ seriesId: 9, name: "New", sortName: "New Sort" });

    const entry = store.get<{ series: { id: number; name: string; sortName: string } }>("series/9", "detail");
    expect(entry).not.toBeUndefined();
    expect(entry?.series.name).toBe("New");
    expect(entry?.series.sortName).toBe("New Sort");
  });

  it("applySeriesRename derives series sortName when it is absent from payload", () => {
    store.set("series/9", "detail", {
      series: { id: 9, name: "Old", sortName: "Old Sort" },
      books: [],
    }, { context: seriesNineContext });

    store.applySeriesRename({ seriesId: 9, name: "New Series" });

    const entry = store.get<{ series: { sortName?: string } }>("series/9", "detail");
    expect(entry?.series.sortName).toBe("New Series");
  });

  it("applySeriesRename не трогает записи других серий", () => {
    store.set("series/9", "detail", {
      series: { id: 9, name: "Old" },
      books: [],
    }, { context: seriesNineContext });
    store.set("series/10", "detail", {
      series: { id: 10, name: "Untouched" },
      books: [],
    }, { context: seriesTenContext });

    store.applySeriesRename({ seriesId: 9, name: "New" });

    const other = store.get<{ series: { name: string } }>("series/10", "detail");
    expect(other?.series.name).toBe("Untouched");
  });

  it("applyAuthorRename patches cached book detail author refs", () => {
    const store = new MetadataCacheStore();
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [{ id: 7, name: "Old", sortName: "Old" }],
        series: null,
        tags: [],
      },
    });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get<{ book: { authors: unknown[] } }>("book/10", "detail")?.book.authors).toEqual([
      { id: 7, name: "New", sortName: "New" },
    ]);
  });

  it("does not notify or bump version for no-op book detail author rename with malformed refs", () => {
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [null, "bad", { id: "7", name: "Old", sortName: "Old" }, { id: 8, name: "Other" }],
        series: null,
        tags: [],
      },
    });
    const subscriber = vi.fn();
    store.subscribe("book/10", subscriber);

    expect(() => {
      store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });
    }).not.toThrow();

    expect(subscriber).not.toHaveBeenCalled();
    expect(store.get<{ book: { authors: unknown[] } }>("book/10", "detail")?.book.authors).toEqual([
      null,
      "bad",
      { id: "7", name: "Old", sortName: "Old" },
      { id: 8, name: "Other" },
    ]);
  });

  it("applySeriesRename patches cached book detail series ref", () => {
    const store = new MetadataCacheStore();
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [],
        series: { id: 9, name: "Old", sortName: "Old" },
        tags: [],
      },
    });

    store.applySeriesRename({ seriesId: 9, name: "New", sortName: "New" });

    expect(store.get<{ book: { series: unknown } }>("book/10", "detail")?.book.series).toEqual({
      id: 9,
      name: "New",
      sortName: "New",
    });
  });

  it("does not notify or bump version for no-op book detail series rename when values are unchanged", () => {
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [],
        series: { id: 9, name: "Old Series", sortName: "Series Sort" },
        tags: [],
      },
    });
    const subscriber = vi.fn();
    store.subscribe("book/10", subscriber);

    store.applySeriesRename({ seriesId: 9, name: "Old Series", sortName: "Series Sort" });

    expect(subscriber).not.toHaveBeenCalled();
    expect(store.get<{ book: { series: { name: string; sortName: string } } }>("book/10", "detail")?.book.series)
      .toEqual({ id: 9, name: "Old Series", sortName: "Series Sort" });
  });

  it("applyTagRename patches cached book detail tag refs", () => {
    const store = new MetadataCacheStore();
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [],
        series: null,
        tags: [{ id: 3, name: "Old" }],
      },
    });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ book: { tags: unknown[] } }>("book/10", "detail")?.book.tags).toEqual([
      { id: 3, name: "New" },
    ]);
  });

  it("does not notify or bump version for no-op book detail tag rename with malformed refs", () => {
    store.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [],
        series: null,
        tags: [undefined, "bad", { id: "3", name: "Old Tag" }, { id: 4, name: "Other" }],
      },
    });
    const subscriber = vi.fn();
    store.subscribe("book/10", subscriber);

    expect(() => {
      store.applyTagRename({ tagId: 3, name: "New" });
    }).not.toThrow();

    expect(subscriber).not.toHaveBeenCalled();
    expect(store.get<{ book: { tags: unknown[] } }>("book/10", "detail")?.book.tags).toEqual([
      undefined,
      "bad",
      { id: "3", name: "Old Tag" },
      { id: 4, name: "Other" },
    ]);
  });

  it("applySeriesRename патчит persisted namespace, который ещё не материализован в памяти", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_series/9",
      JSON.stringify({
        detail: {
          value: { series: { id: 9, name: "Old", sortName: "Old Sort" }, books: [] },
          context: {
            kind: "book-list",
            key: "/series/9",
            source: "series-detail",
            seriesId: 9,
            sort: "seriesNumber",
          },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applySeriesRename({ seriesId: 9, name: "New", sortName: "New Sort" });

    const entry = hydrated.get<{ series: { name: string; sortName: string } }>("series/9", "detail");
    expect(entry).not.toBeUndefined();
    expect(entry?.series.name).toBe("New");
    expect(entry?.series.sortName).toBe("New Sort");
  });

  it("applySeriesRename обновляет запись без context (например, без books)", () => {
    store.set("series/9", "detail", { series: { id: 9, name: "Old" } });

    store.applySeriesRename({ seriesId: 9, name: "New" });

    const entry = store.get<{ series: { name: string } }>("series/9", "detail");
    expect(entry).not.toBeUndefined();
    expect(entry?.series.name).toBe("New");
  });

  it("applyAuthorRename патчит persisted namespace, который ещё не материализован в памяти", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_author/7",
      JSON.stringify({
        detail: {
          value: { author: { id: 7, name: "Old", sortName: "Old Sort" }, books: [] },
          context: {
            kind: "book-list",
            key: "/authors/7",
            source: "author-detail",
            authorId: 7,
            sort: "authorAsc",
          },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyAuthorRename({ authorId: 7, name: "New", sortName: "New Sort" });

    const entry = hydrated.get<{ author: { name: string; sortName: string } }>("author/7", "detail");
    expect(entry).not.toBeUndefined();
    expect(entry?.author.name).toBe("New");
    expect(entry?.author.sortName).toBe("New Sort");
  });

  it("applyAuthorRename patches persisted book detail namespace after hydration", () => {
    const first = new MetadataCacheStore();
    first.set("book/10", "detail", {
      book: { id: 10, title: "Book", authors: [{ id: 7, name: "Old" }], series: null, tags: [] },
    });

    const hydrated = new MetadataCacheStore();
    hydrated.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(hydrated.get<{ book: { authors: unknown[] } }>("book/10", "detail")?.book.authors).toEqual([
      { id: 7, name: "New", sortName: "New" },
    ]);
  });

  it("applySeriesRename and applyTagRename patch persisted book detail refs after hydration", () => {
    const first = new MetadataCacheStore();
    first.set("book/10", "detail", {
      book: {
        id: 10,
        title: "Book",
        authors: [],
        series: { id: 9, name: "Old Series" },
        tags: [{ id: 3, name: "Old Tag" }],
      },
    });

    const hydrated = new MetadataCacheStore();
    hydrated.applySeriesRename({ seriesId: 9, name: "New Series", sortName: "New Series" });
    hydrated.applyTagRename({ tagId: 3, name: "New Tag" });

    const book = hydrated.get<{ book: { series: unknown; tags: unknown[] } }>("book/10", "detail")?.book;
    expect(book?.series).toEqual({ id: 9, name: "New Series", sortName: "New Series" });
    expect(book?.tags).toEqual([{ id: 3, name: "New Tag" }]);
  });

  it("rename patches persisted aggregate and filter option namespaces after hydration", () => {
    const first = new MetadataCacheStore();
    first.set("authors", "all", { authors: [{ id: 7, name: "Old", sortName: "Old", bookCount: 1 }] });
    first.set("filter-options/authors", "all", { authors: [{ id: 7, name: "Old" }] });

    const hydrated = new MetadataCacheStore();
    hydrated.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(hydrated.get<{ authors: unknown[] }>("authors", "all")?.authors).toEqual([
      { id: 7, name: "New", sortName: "New", bookCount: 1 },
    ]);
    expect(hydrated.get<{ authors: unknown[] }>("filter-options/authors", "all")?.authors).toEqual([
      { id: 7, name: "New" },
    ]);
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
      book: { id: 3, title: "Book C", authors: [], series: null, seriesNumber: null, coverPath: "", rating: null, isRead: false, tags: [] },
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
    const book = { id: 3, title: "Book C", authors: [], series: null, seriesNumber: null, coverPath: "", rating: null, isRead: false, tags: [] };

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

  it("applyShelfMembershipChange уведомляет подписчиков namespace", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }],
    });
    const handler = vi.fn();
    store.subscribe("shelf/42", handler);

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    expect(handler).toHaveBeenCalled();
  });

  it("applyShelfMembershipChange add без book инкрементирует invalidationVersion", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "My Shelf" },
      books: [{ id: 1, title: "Book A" }],
    });
    const before = store.invalidationVersion("shelf/42");

    store.applyShelfMembershipChange({ shelfId: 42, bookId: 3, hasBook: true });

    expect(store.invalidationVersion("shelf/42")).toBe(before + 1);
  });

  it("applyShelfRename уведомляет подписчиков namespace", () => {
    store.set("shelf/42", "/api/shelves/42", {
      shelf: { id: 42, name: "Old" },
      books: [],
    });
    const handler = vi.fn();
    store.subscribe("shelf/42", handler);

    store.applyShelfRename({ shelfId: 42, name: "New" });

    expect(handler).toHaveBeenCalled();
  });

  it("applyShelfRename патчит persisted namespace, который ещё не материализован в памяти", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_shelf/42",
      JSON.stringify({
        "/api/shelves/42": {
          value: { shelf: { id: 42, name: "Old Name" }, books: [{ id: 1, title: "Book A" }] },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyShelfRename({ shelfId: 42, name: "New Name" });

    const entry = hydrated.get<{ shelf: { name: string } }>("shelf/42", "/api/shelves/42");
    expect(entry).not.toBeUndefined();
    expect(entry?.shelf.name).toBe("New Name");
  });

  it("applyShelfMembershipChange патчит persisted namespace, который ещё не материализован в памяти", () => {
    sessionStorage.setItem(
      "librarium_metadata_cache_shelf/42",
      JSON.stringify({
        "/api/shelves/42": {
          value: { shelf: { id: 42, name: "My Shelf" }, books: [{ id: 1, title: "Book A" }, { id: 2, title: "Book B" }] },
        },
      }),
    );
    const hydrated = new MetadataCacheStore();

    hydrated.applyShelfMembershipChange({ shelfId: 42, bookId: 1, hasBook: false });

    const entry = hydrated.get<{ books: { id: number }[] }>("shelf/42", "/api/shelves/42");
    expect(entry).not.toBeUndefined();
    expect(entry?.books).toHaveLength(1);
    expect(entry?.books[0].id).toBe(2);
  });

});

describe("applyTagRename", () => {
  const tagOneContext: BookListContext = {
    kind: "book-list",
    key: "/tags/1",
    source: "tag-detail",
    tagId: 1,
    sort: "addedDesc",
  };
  const tagTwoContext: BookListContext = {
    kind: "book-list",
    key: "/tags/2",
    source: "tag-detail",
    tagId: 2,
    sort: "addedDesc",
  };

  it("applyTagRename patches tag detail namespace", () => {
    const store = new MetadataCacheStore();
    const key = "/tags/3?sort=addedDesc";
    store.set("tag/3", key, { tag: { id: 3, name: "Old", bookCount: 4 } });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ tag: unknown }>("tag/3", key)?.tag).toEqual({
      id: 3,
      name: "New",
      bookCount: 4,
    });
  });

  it("updates tag.name in namespace tag/{id}", () => {
    const store = new MetadataCacheStore();
    store.set("tag/1", "detail", { tag: { id: 1, name: "Old" }, books: [] }, { context: tagOneContext });
    store.applyTagRename({ tagId: 1, name: "New" });
    const entry = store.get<{ tag: { name: string } }>("tag/1", "detail");
    expect(entry?.tag.name).toBe("New");
  });

  it("does not touch tag/{other-id}", () => {
    const store = new MetadataCacheStore();
    store.set("tag/2", "detail", { tag: { id: 2, name: "Untouched" }, books: [] }, { context: tagTwoContext });
    store.applyTagRename({ tagId: 1, name: "New" });
    // namespace isolation — applyTagRename targets only tag/{payload.tagId} entries
    const entry = store.get<{ tag: { name: string } }>("tag/2", "detail");
    expect(entry?.tag.name).toBe("Untouched");
  });

  it("patches book.tags refs through general pass", () => {
    const store = new MetadataCacheStore();
    store.set("catalog", "p1", {
      books: [
        { id: 1, title: "B1", tags: [{ id: 1, name: "Old" }, { id: 2, name: "Other" }] },
        { id: 2, title: "B2", tags: [{ id: 1, name: "Old" }] },
        { id: 3, title: "B3", tags: [{ id: 3, name: "Untouched" }] },
      ],
    }, { context: { kind: "book-list", source: "catalog", sort: "addedDesc", key: "/" } });
    store.applyTagRename({ tagId: 1, name: "New" });
    const value = store.get<{ books: Array<{ tags: Array<{ id: number; name: string }> }> }>("catalog", "p1");
    expect(value!.books[0].tags).toEqual([{ id: 1, name: "New" }, { id: 2, name: "Other" }]);
    expect(value!.books[1].tags).toEqual([{ id: 1, name: "New" }]);
    expect(value!.books[2].tags).toEqual([{ id: 3, name: "Untouched" }]);
  });

  it("deletes entries without context (general pass)", () => {
    const store = new MetadataCacheStore();
    store.set("catalog", "p2", { books: [{ id: 1, tags: [{ id: 1, name: "X" }] }] });  // no context arg
    store.applyTagRename({ tagId: 1, name: "Y" });
    expect(store.get("catalog", "p2")).toBeUndefined();
  });

  it("deletes entries with search context (classifier → structural)", () => {
    const store = new MetadataCacheStore();
    store.set("catalog", "search-q", {
      books: [{ id: 1, title: "B", tags: [{ id: 1, name: "Old" }] }],
    }, { context: { kind: "book-list", source: "search", sort: "addedDesc", key: "/search" } });
    store.applyTagRename({ tagId: 1, name: "New" });
    expect(store.get("catalog", "search-q")).toBeUndefined();
  });
});
