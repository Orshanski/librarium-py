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

  it("fetches and stores the first page with context when cache is empty", async () => {
    const spy = vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 1, title: "Fresh" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await screen.findByText("Fresh");
    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0];
    expect(callArg).toMatchObject({ sort: "addedDesc", cursor: 0, pageSize: 30 });

    const stored = store.get<CatalogEntry>("books", "/");
    expect(stored?.books[0]?.title).toBe("Fresh");
    expect(stored?.cursor).toBe(1);
    expect(stored?.hasMore).toBe(false);
  });

  it("does not write stale in-flight results after invalidation", async () => {
    const first = deferred<{ books: Book[]; hasMore: boolean }>();
    const spy = vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ books: [{ id: 2, title: "Fresh" } as Book], hasMore: false });

    render(<Harness store={store} params={baseParams} />);
    expect(screen.getByTestId("loading").textContent).toBe("true");

    store.invalidate("books");
    first.resolve({ books: [{ id: 1, title: "Stale" } as Book], hasMore: false });

    await screen.findByText("Fresh");
    expect(screen.queryByText("Stale")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
    const stored = store.get<CatalogEntry>("books", "/");
    expect(stored?.books[0]?.title).toBe("Fresh");
  });

  it("re-runs the fetch on urlKey change alone and does not corrupt the new key", async () => {
    const first = deferred<{ books: Book[]; hasMore: boolean }>();
    vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ books: [{ id: 2, title: "Second" } as Book], hasMore: false });

    // Stable context reference reused across both renders, so the only changed dep is urlKey.
    const stableContext = CTX;

    const { rerender } = render(
      <Harness store={store} params={{ ...baseParams, context: stableContext }} />,
    );
    expect(screen.getByTestId("loading").textContent).toBe("true");

    rerender(
      <Harness
        store={store}
        params={{ ...baseParams, urlKey: "/?sort=titleAsc", sort: "titleAsc", context: stableContext }}
      />,
    );

    first.resolve({ books: [{ id: 1, title: "First" } as Book], hasMore: false });
    await screen.findByText("Second");

    expect(screen.queryByText("First")).toBeNull();
    const newEntry = store.get<CatalogEntry>("books", "/?sort=titleAsc");
    expect(newEntry?.books.map((b) => b.title)).toEqual(["Second"]);
  });

  it("loadMore fetches next page with cursor, merges and writes back", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book, { id: 2, title: "B2" } as Book],
      hasMore: true,
      cursor: 2,
    };
    store.set("books", "/", seeded, { context: CTX });
    const spy = vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 3, title: "B3" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    await screen.findByText("B3");

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 2, pageSize: 15 }),
    );
    const stored = store.get<CatalogEntry>("books", "/");
    expect(stored?.books.map((b) => b.id)).toEqual([1, 2, 3]);
    expect(stored?.cursor).toBe(3);
    expect(stored?.hasMore).toBe(false);
  });

  it("loadMore dedups by id, prev wins", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "Original" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 1, title: "Duplicate" } as Book, { id: 2, title: "New" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    await screen.findByText("New");

    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.queryByText("Duplicate")).toBeNull();
  });

  it("loadMore does not write after invalidation; loadingMore is reset", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const pending = deferred<{ books: Book[]; hasMore: boolean }>();
    vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ books: [{ id: 99, title: "Refetched" } as Book], hasMore: false });

    render(<Harness store={store} params={baseParams} />);
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    store.invalidate("books");
    pending.resolve({ books: [{ id: 2, title: "Stale" } as Book], hasMore: false });

    await screen.findByText("Refetched");
    expect(screen.getByTestId("loadingMore").textContent).toBe("false");
    expect(screen.queryByText("Stale")).toBeNull();
  });
});
