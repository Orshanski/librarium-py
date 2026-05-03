import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataCacheStore } from "../store";
import { useCachedResource } from "../useCachedResource";

function Harness({ store, cacheKey, fetcher }: {
  store: MetadataCacheStore;
  cacheKey: string;
  fetcher: (signal: AbortSignal) => Promise<{ value: string }>;
}) {
  const result = useCachedResource(store, "demo", cacheKey, fetcher);
  if (result.error) return <div role="alert">{result.error.message}</div>;
  if (result.loading) return <div>loading</div>;
  return <div>{result.data?.value ?? "empty"}</div>;
}

function BookListHarness({ store, cacheKey, fetcher }: {
  store: MetadataCacheStore;
  cacheKey: string;
  fetcher: (signal: AbortSignal) => Promise<{ books: Array<{ id: number; title: string }> }>;
}) {
  const result = useCachedResource(store, "books", cacheKey, fetcher, {
    context: { kind: "book-list", key: cacheKey, source: "catalog", sort: "titleAsc" },
  });
  if (result.error) return <div role="alert">{result.error.message}</div>;
  if (result.loading) return <div>loading</div>;
  return <div>{result.data?.books[0]?.title ?? "empty"}</div>;
}

function InlineFailureHarness({ store, fetcher }: {
  store: MetadataCacheStore;
  fetcher: () => Promise<{ books: Array<{ id: number; title: string }> }>;
}) {
  const result = useCachedResource(
    store,
    "books",
    "inline-fail",
    () => fetcher(),
    { context: { kind: "book-list", key: "inline-fail", source: "catalog", sort: "titleAsc" } },
  );
  if (result.error) return <div role="alert">{result.error.message}</div>;
  if (result.loading) return <div>loading</div>;
  return <div>{result.data?.books[0]?.title ?? "empty"}</div>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCachedResource", () => {
  let store: MetadataCacheStore;

  beforeEach(() => {
    sessionStorage.clear();
    store = new MetadataCacheStore();
  });

  it("fetches missing data and stores it", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: "fresh" });

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    await screen.findByText("fresh");
    expect(store.get("demo", "k1")).toEqual({ value: "fresh" });
  });

  it("uses cached data without fetching", () => {
    store.set("demo", "k1", { value: "cached" });
    const fetcher = vi.fn().mockResolvedValue({ value: "fresh" });

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);

    expect(screen.getByText("cached")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refetches after namespace invalidation", async () => {
    store.set("demo", "k1", { value: "cached" });
    const fetcher = vi.fn().mockResolvedValue({ value: "fresh" });

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);
    store.invalidate("demo");

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await screen.findByText("fresh");
  });

  it("does not store stale in-flight results after namespace invalidation", async () => {
    const first = deferred<{ value: string }>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ value: "fresh" });

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);
    expect(screen.getByText("loading")).toBeInTheDocument();

    store.invalidate("demo");
    first.resolve({ value: "stale" });

    await screen.findByText("fresh");
    expect(store.get("demo", "k1")).toEqual({ value: "fresh" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not discard valid in-flight results after unrelated same-namespace writes", async () => {
    const first = deferred<{ value: string }>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise);

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);
    store.set("demo", "k2", { value: "other" });
    first.resolve({ value: "fresh" });

    await screen.findByText("fresh");
    expect(store.get("demo", "k1")).toEqual({ value: "fresh" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("exposes fetch errors without throwing from async effects", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
  });

  it("ignores stale non-abort rejections after switching cache key", async () => {
    const first = deferred<{ value: string }>();
    const fetcher = vi.fn((signal: AbortSignal) => (
      signal.aborted
        ? Promise.resolve({ value: "aborted" })
        : first.promise
    ));

    const { rerender } = render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);
    rerender(<Harness store={store} cacheKey="k2" fetcher={() => Promise.resolve({ value: "second" })} />);
    first.reject(new Error("stale failure"));

    await screen.findByText("second");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders cache data when it appears after a previous fetch error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    render(<Harness store={store} cacheKey="k1" fetcher={fetcher} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");

    store.set("demo", "k1", { value: "recovered" });

    await screen.findByText("recovered");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not retry-loop failed inline fetchers or inline context objects", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    render(<InlineFailureHarness store={store} fetcher={fetcher} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  it("does not expose the previous key error after switching to a new missing key", async () => {
    const { rerender } = render(
      <Harness store={store} cacheKey="k1" fetcher={() => Promise.reject(new Error("k1 failed"))} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("k1 failed");

    rerender(<Harness store={store} cacheKey="k2" fetcher={() => new Promise(() => {})} />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stores fetched book lists with their read-model context", async () => {
    const fetcher = vi.fn().mockResolvedValue({ books: [{ id: 1, title: "Old" }] });

    render(<BookListHarness store={store} cacheKey="catalog-title" fetcher={fetcher} />);
    await screen.findByText("Old");

    store.applyBookUpdate({ book: { id: 1, title: "New" }, changedFields: ["title"] });

    expect(store.get("books", "catalog-title")).toBeUndefined();
  });
});
