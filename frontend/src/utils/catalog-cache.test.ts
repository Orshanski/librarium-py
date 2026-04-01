import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { removeBookFromCatalogCache } from "./catalog-cache";

const CACHE_KEY = "librarium_catalog";

const makeCache = (books: any[], extra = {}) =>
  JSON.stringify({
    books,
    filterOptions: { authors: [], tags: [] },
    hasMore: true,
    paramsKey: "added_desc|||",
    scrollTop: 420,
    ...extra,
  });

describe("removeBookFromCatalogCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("убирает книгу из кэша по ID", () => {
    sessionStorage.setItem(
      CACHE_KEY,
      makeCache([{ id: 1 }, { id: 2 }, { id: 3 }])
    );
    removeBookFromCatalogCache(2);
    const data = JSON.parse(sessionStorage.getItem(CACHE_KEY)!);
    expect(data.books.map((b: any) => b.id)).toEqual([1, 3]);
  });

  it("не трогает остальные поля кэша", () => {
    sessionStorage.setItem(CACHE_KEY, makeCache([{ id: 1 }, { id: 2 }]));
    removeBookFromCatalogCache(1);
    const data = JSON.parse(sessionStorage.getItem(CACHE_KEY)!);
    expect(data.scrollTop).toBe(420);
    expect(data.paramsKey).toBe("added_desc|||");
    expect(data.hasMore).toBe(true);
  });

  it("не падает если кэша нет", () => {
    expect(() => removeBookFromCatalogCache(99)).not.toThrow();
  });

  it("не падает если кэш повреждён", () => {
    sessionStorage.setItem(CACHE_KEY, "not-json");
    expect(() => removeBookFromCatalogCache(1)).not.toThrow();
  });
});
