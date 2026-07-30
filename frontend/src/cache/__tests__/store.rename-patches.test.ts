import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataCacheStore } from "../store";

describe("MetadataCacheStore rename patches", () => {
  let store: MetadataCacheStore;

  beforeEach(() => {
    store = new MetadataCacheStore();
    sessionStorage.clear();
  });

  it("applyAuthorRename patches authors aggregate and preserves counters", () => {
    store.set("authors", "all", {
      authors: [{ id: 7, name: "Old", sortName: "Old", bookCount: 3, tags: [{ id: 1, name: "T" }] }],
    });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get<{ authors: unknown[] }>("authors", "all")?.authors).toEqual([
      { id: 7, name: "New", sortName: "New", bookCount: 3, tags: [{ id: 1, name: "T" }] },
    ]);
  });

  it("applyAuthorRename derives sortName and re-sorts aggregate rows for name-only payloads", () => {
    store.set("authors", "all", {
      authors: [
        { id: 1, name: "Middle Writer", sortName: "Writer, Middle" },
        { id: 7, name: "Old Zed", sortName: "Zed, Old", bookCount: 3 },
      ],
    });
    store.set("book/10", "detail", {
      book: { id: 10, authors: [{ id: 7, name: "Old Zed", sortName: "Zed, Old" }], series: null, tags: [] },
    });
    store.set("series", "all", {
      series: [{ id: 9, name: "Series", authors: [{ id: 7, name: "Old Zed", sortName: "Zed, Old" }] }],
    });

    store.applyAuthorRename({ authorId: 7, name: "Aaron Alpha" });

    expect(store.get<{ authors: Array<{ id: number; sortName: string }> }>("authors", "all")?.authors).toEqual([
      { id: 7, name: "Aaron Alpha", sortName: "Alpha, Aaron", bookCount: 3 },
      { id: 1, name: "Middle Writer", sortName: "Writer, Middle" },
    ]);
    expect(store.get<{ book: { authors: unknown[] } }>("book/10", "detail")?.book.authors).toEqual([
      { id: 7, name: "Aaron Alpha", sortName: "Alpha, Aaron" },
    ]);
    expect(store.get<{ series: Array<{ authors: unknown[] }> }>("series", "all")?.series[0].authors).toEqual([
      { id: 7, name: "Aaron Alpha", sortName: "Alpha, Aaron" },
    ]);
  });

  it("applyAuthorRename patches bare filter option arrays without refetching", () => {
    store.set("filter-options/authors", "authorIds|", [
      { id: 1, name: "Zulu" },
      { id: 7, name: "Old" },
      { id: 3, name: "Alpha" },
    ]);

    store.applyAuthorRename({ authorId: 7, name: "Beta" });

    expect(store.get("filter-options/authors", "authorIds|")).toEqual([
      { id: 3, name: "Alpha" },
      { id: 7, name: "Beta" },
      { id: 1, name: "Zulu" },
    ]);
  });

  it("applyAuthorRename is idempotent for aggregate patches", () => {
    const subscriber = vi.fn();
    store.set("authors", "all", { authors: [{ id: 7, name: "Old", bookCount: 1 }] });
    store.subscribe("authors", subscriber);

    store.applyAuthorRename({ authorId: 7, name: "New" });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(store.get<{ authors: unknown[] }>("authors", "all")?.authors).toEqual([
      { id: 7, name: "New", sortName: "New", bookCount: 1 },
    ]);

    subscriber.mockClear();
    store.applyAuthorRename({ authorId: 7, name: "New" });

    // Повторное применение того же переименования не меняет ни записи, ни оповещений.
    expect(subscriber).not.toHaveBeenCalled();
    expect(store.get<{ authors: unknown[] }>("authors", "all")?.authors).toEqual([
      { id: 7, name: "New", sortName: "New", bookCount: 1 },
    ]);
  });

  it("applySeriesRename patches series aggregate and preserves nested authors", () => {
    store.set("series", "all", {
      series: [{ id: 9, name: "Old", sortName: "Old", bookCount: 2, authors: [{ id: 7, name: "A" }] }],
    });

    store.applySeriesRename({ seriesId: 9, name: "New", sortName: "New" });

    expect(store.get<{ series: unknown[] }>("series", "all")?.series).toEqual([
      { id: 9, name: "New", sortName: "New", bookCount: 2, authors: [{ id: 7, name: "A" }] },
    ]);
  });

  it("applySeriesRename derives sortName and re-sorts aggregate rows for name-only payloads", () => {
    store.set("series", "all", {
      series: [
        { id: 1, name: "Middle Series", sortName: "Middle Series" },
        { id: 9, name: "Old Series", sortName: "Zed Series", bookCount: 2 },
      ],
    });
    store.set("book/10", "detail", {
      book: { id: 10, authors: [], series: { id: 9, name: "Old Series", sortName: "Zed Series" }, tags: [] },
    });

    store.applySeriesRename({ seriesId: 9, name: "Alpha Series" });

    expect(store.get<{ series: Array<{ id: number; sortName: string }> }>("series", "all")?.series).toEqual([
      { id: 9, name: "Alpha Series", sortName: "Alpha Series", bookCount: 2 },
      { id: 1, name: "Middle Series", sortName: "Middle Series" },
    ]);
    expect(store.get<{ book: { series: unknown } }>("book/10", "detail")?.book.series).toEqual({
      id: 9,
      name: "Alpha Series",
      sortName: "Alpha Series",
    });
  });

  it("applySeriesRename patches bare filter option arrays without refetching", () => {
    store.set("filter-options/series", "seriesIds|", [
      { id: 1, name: "Zulu" },
      { id: 9, name: "Old" },
      { id: 3, name: "Alpha" },
    ]);

    store.applySeriesRename({ seriesId: 9, name: "Beta" });

    expect(store.get("filter-options/series", "seriesIds|")).toEqual([
      { id: 3, name: "Alpha" },
      { id: 9, name: "Beta" },
      { id: 1, name: "Zulu" },
    ]);
  });

  it("applyTagRename patches tags aggregate and preserves counters", () => {
    store.set("tags", "all", { tags: [{ id: 3, name: "Old", bookCount: 4 }] });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ tags: unknown[] }>("tags", "all")?.tags).toEqual([
      { id: 3, name: "New", bookCount: 4 },
    ]);
  });

  it("applyTagRename patches bare filter option arrays without refetching", () => {
    store.set("filter-options/tags", "tagIds|", [
      { id: 1, name: "Zulu" },
      { id: 3, name: "Old" },
      { id: 5, name: "Alpha" },
    ]);

    store.applyTagRename({ tagId: 3, name: "Beta" });

    expect(store.get("filter-options/tags", "tagIds|")).toEqual([
      { id: 5, name: "Alpha" },
      { id: 3, name: "Beta" },
      { id: 1, name: "Zulu" },
    ]);
  });

  it("does not throw when tags aggregate has malformed value", () => {
    store.set("tags", "all", null as unknown);

    expect(() => store.applyTagRename({ tagId: 3, name: "New" })).not.toThrow();

    expect(store.get("tags", "all")).toBeNull();
  });

  it("preserves malformed rows while patching tags aggregate", () => {
    store.set("tags", "all", {
      tags: [
        null,
        { id: 3, name: "Old", bookCount: 1 },
        "bad",
        { id: "3", name: "Wrong Id Type" },
        { id: 4, name: "Keep" },
        undefined,
      ],
    });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ tags: unknown[] }>("tags", "all")?.tags).toEqual([
      null,
      { id: 3, name: "New", bookCount: 1 },
      "bad",
      { id: "3", name: "Wrong Id Type" },
      { id: 4, name: "Keep" },
      undefined,
    ]);
  });

  it("preserves list order when tag rename hits malformed name rows in filter-options", () => {
    store.set("filter-options/tags", "all", {
      tags: [
        { id: 3, name: "Beta" },
        { id: 4 },
        { id: 5, name: 123 },
        { id: 6, name: "Alpha" },
      ],
    });

    expect(() => store.applyTagRename({ tagId: 6, name: "Omega" })).not.toThrow();

    expect(store.get("filter-options/tags", "all")).toEqual({
      tags: [
        { id: 3, name: "Beta" },
        { id: 4 },
        { id: 5, name: 123 },
        { id: 6, name: "Omega" },
      ],
    });
  });

  it("preserves list order when author rename hits malformed sortName rows", () => {
    store.set("authors", "all", {
      authors: [
        { id: 1, name: "Beta", sortName: "Beta" },
        { id: 2 },
        { id: 3, name: "Gamma", sortName: 123 },
        { id: 4, name: "Alpha", sortName: "Alpha" },
      ],
    });

    expect(() => store.applyAuthorRename({ authorId: 4, name: "A", sortName: "A" })).not.toThrow();

    expect(store.get("authors", "all")).toEqual({
      authors: [
        { id: 1, name: "Beta", sortName: "Beta" },
        { id: 2 },
        { id: 3, name: "Gamma", sortName: 123 },
        { id: 4, name: "A", sortName: "A" },
      ],
    });
  });

  it("preserves malformed values in filter-options/tags during tag rename", () => {
    store.set("filter-options/tags", "all", "bad" as unknown);

    expect(() => store.applyTagRename({ tagId: 3, name: "New" })).not.toThrow();

    expect(store.get("filter-options/tags", "all")).toBe("bad");
  });

  it("does not throw when authors namespace has malformed value during tag rename", () => {
    store.set("authors", "all", null as unknown);

    expect(() => store.applyTagRename({ tagId: 3, name: "New" })).not.toThrow();

    expect(store.get("authors", "all")).toBeNull();
  });

  it("preserves tag cloud order while patching tag rename", () => {
    store.set("tags", "cloud?top=30", {
      tags: [
        { id: 3, name: "Zulu" },
        { id: 4, name: "Alpha" },
        { id: 5, name: "Echo" },
      ],
    });

    store.applyTagRename({ tagId: 4, name: "Omega" });

    expect(store.get<{ tags: Array<{ id: number; name: string }> }>("tags", "cloud?top=30")?.tags).toEqual([
      { id: 3, name: "Zulu" },
      { id: 4, name: "Omega" },
      { id: 5, name: "Echo" },
    ]);
  });

  it("rename patches keep aggregate rows sorted after display name changes", () => {
    store.set("authors", "all", {
      authors: [
        { id: 1, name: "B", sortName: "B" },
        { id: 2, name: "C", sortName: "C" },
      ],
    });
    store.set("series", "all", {
      series: [
        { id: 3, name: "B", sortName: "B" },
        { id: 4, name: "C", sortName: "C" },
      ],
    });
    store.set("tags", "all", { tags: [{ id: 5, name: "B" }, { id: 6, name: "C" }] });

    store.applyAuthorRename({ authorId: 2, name: "A", sortName: "A" });
    store.applySeriesRename({ seriesId: 4, name: "A", sortName: "A" });
    store.applyTagRename({ tagId: 6, name: "A" });

    expect(store.get<{ authors: Array<{ id: number }> }>("authors", "all")?.authors.map((row) => row.id)).toEqual([2, 1]);
    expect(store.get<{ series: Array<{ id: number }> }>("series", "all")?.series.map((row) => row.id)).toEqual([4, 3]);
    expect(store.get<{ tags: Array<{ id: number }> }>("tags", "all")?.tags.map((row) => row.id)).toEqual([6, 5]);
  });

  it("applyAuthorRename patches author filter options without clearing namespace", () => {
    store.set("filter-options/authors", "all", { authors: [{ id: 7, name: "Old" }] });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get<{ authors: unknown[] }>("filter-options/authors", "all")?.authors).toEqual([
      { id: 7, name: "New" },
    ]);
  });

  it("applySeriesRename patches series filter options without clearing namespace", () => {
    store.set("filter-options/series", "all", { series: [{ id: 9, name: "Old" }] });

    store.applySeriesRename({ seriesId: 9, name: "New", sortName: "New" });

    expect(store.get<{ series: unknown[] }>("filter-options/series", "all")?.series).toEqual([
      { id: 9, name: "New" },
    ]);
  });

  it("applyTagRename patches tag filter options without clearing namespace", () => {
    store.set("filter-options/tags", "all", { tags: [{ id: 3, name: "Old" }] });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ tags: unknown[] }>("filter-options/tags", "all")?.tags).toEqual([
      { id: 3, name: "New" },
    ]);
  });

  it("rename patches keep filter option rows sorted after display name changes", () => {
    store.set("filter-options/authors", "all", { authors: [{ id: 1, name: "B" }, { id: 2, name: "C" }] });
    store.set("filter-options/series", "all", { series: [{ id: 3, name: "B" }, { id: 4, name: "C" }] });
    store.set("filter-options/tags", "all", { tags: [{ id: 5, name: "B" }, { id: 6, name: "C" }] });

    store.applyAuthorRename({ authorId: 2, name: "A", sortName: "A" });
    store.applySeriesRename({ seriesId: 4, name: "A", sortName: "A" });
    store.applyTagRename({ tagId: 6, name: "A" });

    expect(store.get<{ authors: Array<{ id: number }> }>("filter-options/authors", "all")?.authors.map((row) => row.id)).toEqual([2, 1]);
    expect(store.get<{ series: Array<{ id: number }> }>("filter-options/series", "all")?.series.map((row) => row.id)).toEqual([4, 3]);
    expect(store.get<{ tags: Array<{ id: number }> }>("filter-options/tags", "all")?.tags.map((row) => row.id)).toEqual([6, 5]);
  });

  it("applyAuthorRename patches author refs inside series aggregate", () => {
    store.set("series", "all", {
      series: [{ id: 9, name: "S", bookCount: 1, authors: [{ id: 7, name: "Old", sortName: "Old" }] }],
    });

    store.applyAuthorRename({ authorId: 7, name: "New", sortName: "New" });

    expect(store.get<{ series: Array<{ authors: unknown[] }> }>("series", "all")?.series[0].authors).toEqual([
      { id: 7, name: "New", sortName: "New" },
    ]);
  });

  it("applyTagRename patches tag refs inside authors aggregate", () => {
    store.set("authors", "all", {
      authors: [{ id: 7, name: "A", bookCount: 1, tags: [{ id: 3, name: "Old" }] }],
    });

    store.applyTagRename({ tagId: 3, name: "New" });

    expect(store.get<{ authors: Array<{ tags: unknown[] }> }>("authors", "all")?.authors[0].tags).toEqual([
      { id: 3, name: "New" },
    ]);
  });

  it("applyTagRename патчит жанры внутри карточки автора", () => {
    // Детальный ответ автора теперь отдаёт его жанры (23od) — тот же агрегат, что в
    // списке авторов, который патчится рядом. Без этого закэшированная страница автора
    // показывала бы старое имя жанра.
    store.set(
      "author/5",
      "detail",
      {
        author: { id: 5, name: "Акунин", bookCount: 1, tags: [{ id: 3, name: "Старое" }] },
        books: [{ id: 11, title: "Книга" }],
      },
      { context: { kind: "book-list", key: "author/5", source: "author-detail", authorId: 5, sort: "addedDesc" } },
    );

    store.applyTagRename({ tagId: 3, name: "Новое" });

    const value = store.get<{ author: { tags: Array<{ id: number; name: string }> } }>("author/5", "detail");
    expect(value?.author.tags).toEqual([{ id: 3, name: "Новое" }]);
  });

  it("applyAuthorRename патчит авторов внутри карточки серии", () => {
    store.set(
      "series/9",
      "detail",
      {
        series: { id: 9, name: "Фандорин", bookCount: 1, authors: [{ id: 7, name: "Старое" }] },
        books: [{ id: 12, title: "Книга" }],
      },
      { context: { kind: "book-list", key: "series/9", source: "series-detail", seriesId: 9, sort: "seriesNumber" } },
    );

    store.applyAuthorRename({ authorId: 7, name: "Новое" });

    const value = store.get<{ series: { authors: Array<{ name: string }> } }>("series/9", "detail");
    expect(value?.series.authors[0].name).toBe("Новое");
  });

});
