// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { BookListContext } from "@/domain/read-models";
import { useEntityScrollContext } from "../useEntityScrollContext";

function fakeAuthorScrollContext(key: string, entityId: number): BookListContext {
  return {
    kind: "book-list",
    key,
    source: "author-detail",
    sort: "authorAsc",
    authorId: entityId,
  };
}

describe("useEntityScrollContext", () => {
  it("возвращает корректный объект BookListContext для двух-параметрического конструктора", () => {
    const { result } = renderHook(() =>
      useEntityScrollContext(fakeAuthorScrollContext, "/authors/7", 7),
    );
    expect(result.current).toEqual({
      kind: "book-list",
      key: "/authors/7",
      source: "author-detail",
      sort: "authorAsc",
      authorId: 7,
    });
  });

  it("стабилен по референсу при одинаковых аргументах между рендерами", () => {
    const { result, rerender } = renderHook(
      ({ key, entityId }: { key: string; entityId: number }) =>
        useEntityScrollContext(fakeAuthorScrollContext, key, entityId),
      { initialProps: { key: "/authors/7", entityId: 7 } },
    );
    const first = result.current;
    rerender({ key: "/authors/7", entityId: 7 });
    expect(result.current).toBe(first);
  });

  it("возвращает разный референс при смене key", () => {
    const { result, rerender } = renderHook(
      ({ key, entityId }: { key: string; entityId: number }) =>
        useEntityScrollContext(fakeAuthorScrollContext, key, entityId),
      { initialProps: { key: "/authors/7", entityId: 7 } },
    );
    const first = result.current;
    rerender({ key: "/authors/7?sort=titleAsc", entityId: 7 });
    expect(result.current).not.toBe(first);
  });

  it("возвращает разный референс при смене entityId", () => {
    const { result, rerender } = renderHook(
      ({ key, entityId }: { key: string; entityId: number }) =>
        useEntityScrollContext(fakeAuthorScrollContext, key, entityId),
      { initialProps: { key: "/authors/7", entityId: 7 } },
    );
    const first = result.current;
    rerender({ key: "/authors/7", entityId: 8 });
    expect(result.current).not.toBe(first);
  });
});
