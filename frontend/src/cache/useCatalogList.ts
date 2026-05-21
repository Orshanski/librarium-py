// frontend/src/cache/useCatalogList.ts
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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

  // Deps: urlKey covers all URL-derived fields (sort + ids + languages). `entry === undefined`
  // catches invalidation that removed a populated entry. `invalidationVersion` is a separate
  // signal so React re-renders and the effect re-runs even when the entry was already undefined
  // (cold-mount SSE race: a stale in-flight fetch is dropped via the version guard below, and
  // the effect needs to re-fire to start a fresh fetch — otherwise the spinner would stick
  // forever because the snapshot identity didn't change).
  useEffect(() => {
    if (entry !== undefined) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    setLoading(true);
    listBooks(buildApiParams(params, 0, INITIAL_SIZE), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        const next: CatalogEntry = {
          books: data.books ?? [],
          hasMore: data.hasMore ?? false,
          cursor: (data.books ?? []).length,
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

  return {
    books: entry?.books ?? [],
    loading,
    loadingMore: false,
    hasMore: entry?.hasMore ?? false,
    loadMore: () => {},
  };
}
