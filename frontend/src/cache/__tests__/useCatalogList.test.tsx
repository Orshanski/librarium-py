// frontend/src/cache/__tests__/useCatalogList.test.tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByTestId("loading").textContent).toBe("false");
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
    const stored = store.get<CatalogEntry>("books", "/");
    expect(stored?.cursor).toBe(2);
    expect(stored?.books.map((b) => b.id)).toEqual([1, 2]);
  });

  it("re-runs the fetch on context change alone and uses the new context for the write", async () => {
    const first = deferred<{ books: Book[]; hasMore: boolean }>();
    vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ books: [{ id: 2, title: "Second" } as Book], hasMore: false });

    const ctxA = CTX;
    const ctxB = { ...CTX };  // distinct identity, same shape

    const { rerender } = render(
      <Harness store={store} params={{ ...baseParams, context: ctxA }} />,
    );
    expect(screen.getByTestId("loading").textContent).toBe("true");

    // Same urlKey, only context identity changes.
    rerender(
      <Harness store={store} params={{ ...baseParams, context: ctxB }} />,
    );

    first.resolve({ books: [{ id: 1, title: "First" } as Book], hasMore: false });
    await screen.findByText("Second");

    expect(screen.queryByText("First")).toBeNull();
    const stored = store.get<CatalogEntry>("books", "/");
    expect(stored?.books.map((b) => b.title)).toEqual(["Second"]);
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

  it("refetches after invalidation when entry is removed", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "Old" } as Book],
      hasMore: false,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const spy = vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 2, title: "Fresh" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    store.invalidateBookLists();

    await screen.findByText("Fresh");
    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0];
    expect(callArg).toMatchObject({ cursor: 0, pageSize: 30 });
  });

  it("calls loadMore when <main> scrolls near the bottom", async () => {
    const main = document.querySelector("main")!;
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const spy = vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 2, title: "B2" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);

    Object.defineProperty(main, "scrollTop", { value: 700, configurable: true });
    Object.defineProperty(main, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(main, "scrollHeight", { value: 1100, configurable: true });
    main.dispatchEvent(new Event("scroll"));

    await screen.findByText("B2");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("triggers loadMore via the 300ms overflow check when content fits the viewport", async () => {
    const main = document.querySelector("main")!;
    Object.defineProperty(main, "scrollHeight", { value: 100, configurable: true });
    Object.defineProperty(main, "clientHeight", { value: 500, configurable: true });

    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const spy = vi.spyOn(booksApi, "listBooks").mockResolvedValue({
      books: [{ id: 2, title: "B2" } as Book],
      hasMore: false,
    });

    render(<Harness store={store} params={baseParams} />);

    await screen.findByText("B2");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-runs overflow check after initial fetch completes (race #1)", async () => {
    const main = document.querySelector("main")!;
    Object.defineProperty(main, "scrollHeight", { value: 100, configurable: true });
    Object.defineProperty(main, "clientHeight", { value: 500, configurable: true });

    const initial = deferred<{ books: Book[]; hasMore: boolean }>();
    const spy = vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({ books: [{ id: 2, title: "B2" } as Book], hasMore: false });

    render(<Harness store={store} params={baseParams} />);

    // Initial fetch is slow. The one-shot 300ms timer fires while entry is still undefined
    // and the loadMore call is a no-op. Wait past it.
    await new Promise((r) => setTimeout(r, 400));
    expect(spy).toHaveBeenCalledTimes(1);

    // Initial fetch resolves — entry populated, tiny content that doesn't fill the viewport.
    initial.resolve({ books: [{ id: 1, title: "B1" } as Book], hasMore: true });
    await screen.findByText("B1");

    // Without the fix: no second timer would fire because loadMore identity didn't change.
    // With the fix: loading flip true→false rebinds loadMore → new scroll-effect bind → fresh
    // 300ms timer → check() fires → loadMore → second fetch.
    await screen.findByText("B2");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("synchronous double-trigger does not start two parallel fetches (race #2)", async () => {
    const main = document.querySelector("main")!;
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });

    const pending = deferred<{ books: Book[]; hasMore: boolean }>();
    const spy = vi.spyOn(booksApi, "listBooks").mockReturnValueOnce(pending.promise);

    render(<Harness store={store} params={baseParams} />);

    Object.defineProperty(main, "scrollTop", { value: 700, configurable: true });
    Object.defineProperty(main, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(main, "scrollHeight", { value: 1100, configurable: true });

    // Two synchronous scroll events before React can commit the loadingMore state.
    main.dispatchEvent(new Event("scroll"));
    main.dispatchEvent(new Event("scroll"));

    // Without the fix: both would pass the React-state guard and call listBooks twice.
    // With the fix: the ref-based guard rejects the second call atomically.
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);

    pending.resolve({ books: [{ id: 2, title: "B2" } as Book], hasMore: false });
    await screen.findByText("B2");
  });

  it("loadMore rejection after invalidation does not reset a successor's loadingMore", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const failing = deferred<{ books: Book[]; hasMore: boolean }>();
    const second = deferred<{ books: Book[]; hasMore: boolean }>();
    vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(failing.promise)
      .mockReturnValueOnce(second.promise);

    render(<Harness store={store} params={baseParams} />);
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    // Wrap in act so the reset effect's setLoadingMore(false) commits before the next click
    // reads the loadMore closure. Without act, store.invalidate runs outside React's batch
    // and the stale loadingMore=true would make the second click early-return.
    act(() => {
      store.invalidate("books");
      // After invalidate, the reset effect runs. Seed fresh entry so a successor loadMore can fire.
      store.set("books", "/", seeded, { context: CTX });
    });

    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    // The stale (post-invalidate) rejection arrives. Must NOT reset successor's loadingMore.
    failing.reject(new Error("network blip"));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    // Successor resolves cleanly.
    second.resolve({ books: [{ id: 2, title: "Second" } as Book], hasMore: false });
    await screen.findByText("Second");
    expect(screen.getByTestId("loadingMore").textContent).toBe("false");
  });

  it("loadMore stale success after invalidation does not reset a successor's loadingMore guard", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "B1" } as Book],
      hasMore: true,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const staleSuccess = deferred<{ books: Book[]; hasMore: boolean }>();
    const successor = deferred<{ books: Book[]; hasMore: boolean }>();
    const thirdGuard = deferred<{ books: Book[]; hasMore: boolean }>();
    const spy = vi.spyOn(booksApi, "listBooks")
      .mockReturnValueOnce(staleSuccess.promise)
      .mockReturnValueOnce(successor.promise)
      .mockReturnValueOnce(thirdGuard.promise);

    render(<Harness store={store} params={baseParams} />);
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    // Invalidate while the first loadMore is in flight. Reset effect clears loadingMore.
    await act(async () => {
      store.invalidate("books");
      // Reseed so successor's `current = store.get(...)` is defined.
      store.set("books", "/", seeded, { context: CTX });
    });

    // Successor loadMore starts on the next click.
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");
    expect(spy).toHaveBeenCalledTimes(2);

    // The stale (pre-invalidate) success now resolves. Its `.then` version check rejects → must NOT
    // reset the ref/state of the successor.
    staleSuccess.resolve({ books: [{ id: 2, title: "Stale" } as Book], hasMore: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("loadingMore").textContent).toBe("true");

    // Ref-guard discriminator: a third click MUST be rejected. If the stale .then stomped
    // loadingMoreRef.current = false, this click would pass the guard and start a parallel
    // fetch against the same cursor — exactly the bug the regression check is pinning.
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(2);

    // Successor resolves cleanly.
    successor.resolve({ books: [{ id: 3, title: "Real" } as Book], hasMore: false });
    await screen.findByText("Real");
    expect(screen.getByTestId("loadingMore").textContent).toBe("false");
    expect(screen.queryByText("Stale")).toBeNull();
  });

  it("re-renders without refetch when store patches the entry in place", async () => {
    const seeded: CatalogEntry = {
      books: [{ id: 1, title: "Old", rating: null } as Book],
      hasMore: false,
      cursor: 1,
    };
    store.set("books", "/", seeded, { context: CTX });
    const spy = vi.spyOn(booksApi, "listBooks");

    render(<Harness store={store} params={baseParams} />);
    expect(screen.getByText("Old")).toBeInTheDocument();

    // Non-invalidating mutation: applyBookUpdate with a non-structural decision patches the entry
    // in place. The hook must observe the change via useSyncExternalStore identity and re-render
    // without firing a fetch.
    store.applyBookUpdate({
      book: { id: 1, title: "Patched", rating: 5 },
      changedFields: ["rating"],
    });

    await screen.findByText("Patched");
    expect(spy).not.toHaveBeenCalled();
  });


  it("renders empty without throwing when the initial fetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(booksApi, "listBooks").mockRejectedValue(new Error("boom"));

    render(<Harness store={store} params={baseParams} />);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.queryByRole("list")?.children.length ?? 0).toBe(0);
    expect(screen.getByTestId("loadingMore").textContent).toBe("false");
    expect(warn).toHaveBeenCalled();
  });

  describe("смена фильтров во время подгрузки (o6t1)", () => {
    const paramsA: CatalogListParams = { ...baseParams, urlKey: "/?tagIds=1", tagIds: ["1"] };
    const paramsB: CatalogListParams = { ...baseParams, urlKey: "/?tagIds=2", tagIds: ["2"] };

    function seedBothSets() {
      store.set("books", paramsA.urlKey, { books: [{ id: 1, title: "A1" } as Book], hasMore: true, cursor: 1 }, { context: CTX });
      store.set("books", paramsB.urlKey, { books: [{ id: 2, title: "B1" } as Book], hasMore: true, cursor: 1 }, { context: CTX });
    }

    it("подгрузка нового набора не ждёт ответа подгрузки прежнего", async () => {
      seedBothSets();
      const pendingA = deferred<{ books: Book[]; hasMore: boolean }>();
      const pendingB = deferred<{ books: Book[]; hasMore: boolean }>();
      const spy = vi.spyOn(booksApi, "listBooks")
        .mockReturnValueOnce(pendingA.promise)
        .mockReturnValueOnce(pendingB.promise);

      const { rerender } = render(<Harness store={store} params={paramsA} />);
      fireEvent.click(screen.getByText("more"));
      expect(spy).toHaveBeenCalledTimes(1);

      // Смена фильтров: запрос прежнего набора всё ещё в полёте.
      rerender(<Harness store={store} params={paramsB} />);

      // Индикатор не наследуется: у нового набора своего запроса ещё нет.
      expect(screen.getByTestId("loadingMore").textContent).toBe("false");

      fireEvent.click(screen.getByText("more"));

      // Запрос за второй страницей нового набора обязан уйти, не дожидаясь прежнего.
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[1][0]).toMatchObject({ tagIds: ["2"], cursor: 1 });

      // Ответ прежнего набора не гасит индикатор нового — у того свой запрос в полёте.
      await act(async () => { pendingA.resolve({ books: [], hasMore: false }); });
      expect(screen.getByTestId("loadingMore").textContent).toBe("true");

      // Свой ответ гасит.
      await act(async () => { pendingB.resolve({ books: [], hasMore: false }); });
      expect(screen.getByTestId("loadingMore").textContent).toBe("false");
    });

    it("отказ подгрузки прежнего набора не снимает замок у нового", async () => {
      seedBothSets();
      const pendingA = deferred<{ books: Book[]; hasMore: boolean }>();
      const pendingB = deferred<{ books: Book[]; hasMore: boolean }>();
      vi.spyOn(booksApi, "listBooks")
        .mockReturnValueOnce(pendingA.promise)
        .mockReturnValueOnce(pendingB.promise);

      const { rerender } = render(<Harness store={store} params={paramsA} />);
      fireEvent.click(screen.getByText("more"));
      rerender(<Harness store={store} params={paramsB} />);
      fireEvent.click(screen.getByText("more"));

      // Прежний запрос падает — его ветка отказа не трогает чужой замок и индикатор.
      await act(async () => { pendingA.reject(new Error("network")); });

      expect(screen.getByTestId("loadingMore").textContent).toBe("true");
      await act(async () => { pendingB.resolve({ books: [], hasMore: false }); });
    });

    it("возврат к прежнему набору не даёт второго запроса за той же страницей", async () => {
      seedBothSets();
      const pendingA = deferred<{ books: Book[]; hasMore: boolean }>();
      const spy = vi.spyOn(booksApi, "listBooks").mockReturnValueOnce(pendingA.promise);

      const { rerender } = render(<Harness store={store} params={paramsA} />);
      fireEvent.click(screen.getByText("more"));
      rerender(<Harness store={store} params={paramsB} />);
      rerender(<Harness store={store} params={paramsA} />);

      // Запрос набора A всё ещё в полёте — второй такой же уходить не должен.
      fireEvent.click(screen.getByText("more"));

      expect(spy).toHaveBeenCalledTimes(1);
      await act(async () => { pendingA.resolve({ books: [], hasMore: false }); });
    });
  });

});
