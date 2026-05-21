// frontend/src/cache/useCatalogList.ts
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { listBooks, type BookListParams } from "@/api/endpoints/books";
import type { Book } from "@/types";
import type { BookListContext } from "@/domain/read-models";
import type { MetadataCacheStore } from "./store";

export type CatalogListParams = {
  urlKey: string;
  sort: string;
  authorIds: ReadonlyArray<string>;
  seriesIds: ReadonlyArray<string>;
  tagIds: ReadonlyArray<string>;
  language: ReadonlyArray<string>;
  context: BookListContext;
};

export type CatalogListResult = {
  books: Book[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

type CatalogEntry = {
  books: Book[];
  hasMore: boolean;
  cursor: number;
};

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;

function mergeNextPage(prev: CatalogEntry, newBooks: Book[], hasMore: boolean): CatalogEntry {
  const ids = new Set(prev.books.map((b) => b.id));
  const merged = [...prev.books, ...newBooks.filter((b) => !ids.has(b.id))];
  return { books: merged, hasMore, cursor: merged.length };
}

function buildApiParams(
  params: CatalogListParams,
  cursor: number,
  pageSize: number,
): BookListParams & { pageSize: number; cursor: number } {
  return {
    sort: params.sort,
    pageSize,
    cursor,
    ...(params.authorIds.length ? { authorIds: [...params.authorIds] } : {}),
    ...(params.seriesIds.length ? { seriesIds: [...params.seriesIds] } : {}),
    ...(params.tagIds.length ? { tagIds: [...params.tagIds] } : {}),
    ...(params.language.length ? { language: [...params.language] } : {}),
  };
}

export function useCatalogList(
  store: MetadataCacheStore,
  params: CatalogListParams,
): CatalogListResult {
  const subscribe = useMemo(
    () => (handler: () => void) => store.subscribe("books", handler),
    [store],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => store.get<CatalogEntry>("books", params.urlKey),
    () => store.get<CatalogEntry>("books", params.urlKey),
  );
  const invalidationVersion = useSyncExternalStore(
    subscribe,
    () => store.invalidationVersion("books"),
    () => store.invalidationVersion("books"),
  );

  const [loading, setLoading] = useState<boolean>(entry === undefined);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Deps: urlKey covers all URL-derived fields (sort + ids + languages). `entry === undefined`
  // catches invalidation that removed a populated entry. `invalidationVersion` is a separate
  // signal so React re-renders and the effect re-runs even when the entry was already undefined
  // (cold-mount SSE race: a stale in-flight fetch is dropped via the version guard below, and
  // the effect needs to re-fire to start a fresh fetch — otherwise the spinner would stick
  // forever because the snapshot identity didn't change).
  useEffect(() => {
    if (entry !== undefined) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    setLoading(true);
    listBooks(buildApiParams(params, 0, INITIAL_SIZE), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        const books = data.books ?? [];
        const next: CatalogEntry = {
          books,
          hasMore: data.hasMore ?? false,
          cursor: books.length,
        };
        store.set("books", params.urlKey, next, { context: params.context });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setLoading(false);
      });
    return () => controller.abort();
  }, [store, params.urlKey, params.context, entry === undefined, invalidationVersion]);

  // Reset loadingMore whenever the books bucket is invalidated. The loadMore .then() that
  // detects a version mismatch deliberately skips its own setLoadingMore(false) — this effect
  // owns that transition, so the next loadMore is not blocked by the stale guard.
  useEffect(() => {
    setLoadingMore(false);
  }, [invalidationVersion]);

  // loadMore intentionally re-reads `baseline` from the store inside `.then(...)` rather than
  // closing over the snapshot captured at click time. This preserves domain patches
  // (applyBookUpdate / etc.) that may land during the round-trip — they'd otherwise be
  // overwritten by a stale `current` snapshot. `params.sort`/`authorIds`/etc. are intentionally
  // omitted from deps: `params.urlKey` already encodes them.
  const loadMore = useCallback(() => {
    const current = store.get<CatalogEntry>("books", params.urlKey);
    if (!current || !current.hasMore || loading || loadingMore) return;
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    setLoadingMore(true);
    listBooks(buildApiParams(params, current.cursor, PAGE_SIZE))
      .then((data) => {
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        const baseline = store.get<CatalogEntry>("books", params.urlKey);
        if (!baseline) return;
        const next = mergeNextPage(baseline, data.books ?? [], data.hasMore ?? false);
        store.set("books", params.urlKey, next, { context: params.context });
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load more books:", err);
        setLoadingMore(false);
      });
  }, [store, params.urlKey, params.context, loading, loadingMore]);

  return {
    books: entry?.books ?? [],
    loading,
    loadingMore,
    hasMore: entry?.hasMore ?? false,
    loadMore,
  };
}
