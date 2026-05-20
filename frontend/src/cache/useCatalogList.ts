// frontend/src/cache/useCatalogList.ts
import { useMemo, useSyncExternalStore } from "react";
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

  return {
    books: entry?.books ?? [],
    loading: false,
    loadingMore: false,
    hasMore: entry?.hasMore ?? false,
    loadMore: () => {},
  };
}
