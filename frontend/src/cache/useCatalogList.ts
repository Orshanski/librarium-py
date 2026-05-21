// frontend/src/cache/useCatalogList.ts
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

  // Atomic guard for the loadMore re-entry check. Refs update synchronously, so two scroll
  // events firing back-to-back before React commits setLoadingMore(true) cannot both pass —
  // the second observes loadingMoreRef.current === true and bails. The React state
  // (loadingMore) remains as the source of truth for spinner rendering.
  const loadingMoreRef = useRef(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Deps: urlKey covers all URL-derived fields (sort + ids + languages). `invalidationVersion`
  // covers every path that removes/clears the entry (invalidate, bookCreated, structural patches —
  // they all bump it) AND the cold-mount race where entry stays undefined across an invalidate.
  // Task 7's regression pin verifies refetch-on-invalidation; Task 3's race test verifies cold-mount.
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
  }, [store, params.urlKey, params.context, invalidationVersion]);

  // Reset loadingMore whenever the books bucket is invalidated. This effect OWNS both
  // setLoadingMore(false) AND loadingMoreRef.current = false on invalidation. The
  // loadMore .then()/.catch() early-return branches (version mismatch / missing baseline)
  // do NOT touch either — otherwise a stale resolution after a successor loadMore has
  // started would stomp the successor's guard and allow a parallel duplicate fetch.
  // Only the natural-completion success branch in .then resets both.
  useEffect(() => {
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [invalidationVersion]);

  // loadMore intentionally re-reads `baseline` from the store inside `.then(...)` rather than
  // closing over the snapshot captured at click time. This preserves domain patches
  // (applyBookUpdate / etc.) that may land during the round-trip — they'd otherwise be
  // overwritten by a stale `current` snapshot. `params.sort`/`authorIds`/etc. are intentionally
  // omitted from deps: `params.urlKey` already encodes them.
  //
  // `loading` is in deps so that when the initial fetch resolves (loading flips true→false),
  // loadMore's identity changes — the scroll-effect rebinds and re-arms the 300ms overflow
  // check against the freshly populated entry. Without this, a slow initial fetch + tall
  // viewport leaves the user stuck (one-shot 300ms timer fired against an undefined entry).
  const loadMore = useCallback(() => {
    const current = store.get<CatalogEntry>("books", params.urlKey);
    if (!current || !current.hasMore || loadingMoreRef.current) return;
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    loadingMoreRef.current = true;
    setLoadingMore(true);
    listBooks(buildApiParams(params, current.cursor, PAGE_SIZE))
      .then((data) => {
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        // Defensive: in the current store model every entry-removal path also bumps
        // invalidationVersion, so this branch is unreachable. Keep it: if someone later adds
        // a non-invalidating entry-removal (e.g. targeted store.delete), this guard prevents
        // a NaN cursor. If you add such a path, also add a test driving this branch.
        const baseline = store.get<CatalogEntry>("books", params.urlKey);
        if (!baseline) return;
        const next = mergeNextPage(baseline, data.books ?? [], data.hasMore ?? false);
        store.set("books", params.urlKey, next, { context: params.context });
        loadingMoreRef.current = false;
        if (mountedRef.current) setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        if (!mountedRef.current) return;
        console.warn("Failed to load more books:", err);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [store, params.urlKey, params.context, loading]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return undefined;

    function onScroll() {
      if (main!.scrollTop + main!.clientHeight >= main!.scrollHeight - 300) {
        loadMore();
      }
    }
    function check() {
      if (main!.scrollHeight <= main!.clientHeight) {
        loadMore();
      }
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    const timer = setTimeout(check, 300);
    return () => {
      main.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [loadMore]);

  return {
    books: entry?.books ?? [],
    loading,
    loadingMore,
    hasMore: entry?.hasMore ?? false,
    loadMore,
  };
}
