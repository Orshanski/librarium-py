// frontend/src/cache/__tests__/useCatalogList.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as booksApi from "@/api/endpoints/books";
import { MetadataCacheStore } from "../store";
import { useCatalogList, type CatalogListParams } from "../useCatalogList";
import type { Book } from "@/types";

type CatalogEntry = { books: Book[]; hasMore: boolean; cursor: number };

const CTX = { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" } as const;

const baseParams: CatalogListParams = {
  urlKey: "/",
  sort: "addedDesc",
  authorIds: [],
  seriesIds: [],
  tagIds: [],
  language: [],
  context: CTX,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({ store, params }: { store: MetadataCacheStore; params: CatalogListParams }) {
  const { books, loading, loadingMore, hasMore, loadMore } = useCatalogList(store, params);
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="loadingMore">{String(loadingMore)}</div>
      <div data-testid="hasMore">{String(hasMore)}</div>
      <button onClick={loadMore}>more</button>
      <ul>
        {books.map((b) => (
          <li key={b.id}>{b.title}</li>
        ))}
      </ul>
    </div>
  );
}

describe("useCatalogList", () => {
  let store: MetadataCacheStore;
  let mainEl: HTMLElement | null = null;

  beforeEach(() => {
    sessionStorage.clear();
    store = new MetadataCacheStore();
    vi.restoreAllMocks();
    mainEl = document.createElement("main");
    document.body.appendChild(mainEl);
  });

  afterEach(() => {
    if (mainEl && mainEl.parentNode) {
      mainEl.parentNode.removeChild(mainEl);
    }
    mainEl = null;
  });

  it("renders synchronously from cache without firing fetch", () => {
    const spy = vi.spyOn(booksApi, "listBooks");
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "Cached" } as Book],
      hasMore: false,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });

    render(<Harness store={store} params={baseParams} />);

    expect(screen.getByText("Cached")).toBeInTheDocument();
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(spy).not.toHaveBeenCalled();
  });
});
