import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { getShelf, deleteShelf, removeBookFromShelf, type ShelfSummary, type ShelfProgressEntry } from "@/api/endpoints/shelves";
import { SORT_CONFIG, shelfSortConfigKey, sortOptionsFor, type SortOption } from "../config/sort";
import { shelfScrollContext } from "@/scroll/contexts";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { useScrollRestore } from "./useScrollRestore";
import { useRefreshOnReadingNowOnline } from "./useRefreshOnReadingNowOnline";
import type { Book } from "@/types";

export interface UseShelfPageResult {
  shelf: ShelfSummary | null;
  books: Book[];
  loading: boolean;
  isReadingNow: boolean;
  progressByBookId: Record<number, ShelfProgressEntry>;
  sort: string;
  options: SortOption[] | undefined;
  pathnameWithSearch: string;
  deleteShelf: () => Promise<void>;
  removeBookFromShelf: (bookId: number) => Promise<void>;
  onSortChange: (s: string) => void;
}

export function useShelfPage(shelfId: number): UseShelfPageResult {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Fallback default until first fetch — real default-per-page determined after load
  const sort = searchParams.get("sort") || SORT_CONFIG.shelf_regular.default;

  const locationKey = location.pathname + location.search;

  const shelfResource = useCachedResource(
    metadataCache,
    `shelf/${shelfId}`,
    locationKey,
    (signal) => getShelf(shelfId, { sort }, signal),
  );

  const shelf = shelfResource.data?.shelf ?? null;
  const books = shelfResource.data?.books ?? [];
  const progressByBookId = shelfResource.data?.progressByBookId ?? {};
  const loading = shelfResource.loading;

  // scrollContext мемоизирован — зависимость в useEffect ниже опирается на стабильность ссылки.
  const scrollContext = useMemo(
    () => shelfScrollContext({
      key: locationKey,
      shelfId,
      systemCode: shelf?.systemCode,
      sort,
    }),
    [locationKey, shelfId, shelf?.systemCode, sort],
  );

  useScrollRestore(!loading, scrollContext);

  useEffect(() => {
    if (shelfResource.data) {
      metadataCache.updateContext(`shelf/${shelfId}`, locationKey, scrollContext);
    }
  }, [shelfResource.data, shelfId, locationKey, scrollContext]);

  const isReadingNow = shelf?.systemCode === "reading_now";
  // Хук сам подписан на online/offline и срабатывает при isReadingNow && online.
  useRefreshOnReadingNowOnline(isReadingNow);

  // Derived sort config — мемоизируем, чтобы массив options был стабилен по ссылке
  // (PageHeader получает его как проп; стабильная ссылка важна, если позже появится React.memo).
  const options = useMemo<SortOption[] | undefined>(() => {
    const pageKey = shelf ? shelfSortConfigKey(shelf.systemCode) : "shelf_regular";
    const cfg = SORT_CONFIG[pageKey];
    return cfg.options.length > 0 ? sortOptionsFor(pageKey) : undefined;
  }, [shelf?.systemCode]);

  const handleDeleteShelf = useCallback(async () => {
    try {
      await deleteShelf(shelfId);
      // publish → handler инвалидирует 'shelves' в store → Sidebar реактивен через useCachedResource.
      domainEvents.publish("shelfDeleted", { shelfId });
      navigate("/");
    } catch (err) {
      console.warn("Failed to delete shelf:", err);
    }
  }, [shelfId, navigate]);

  const handleRemoveBookFromShelf = useCallback(async (bookId: number) => {
    try {
      await removeBookFromShelf(shelfId, bookId);
      domainEvents.publish("shelfMembershipChanged", { shelfId, bookId, hasBook: false });
    } catch (err) {
      console.warn("Failed to remove book from shelf:", err);
    }
  }, [shelfId]);

  const onSortChange = useCallback((s: string) => {
    navigate(`/shelves/${shelfId}?sort=${s}`);
  }, [shelfId, navigate]);

  return {
    shelf,
    books,
    loading,
    isReadingNow,
    progressByBookId,
    sort,
    options,
    pathnameWithSearch: locationKey,
    deleteShelf: handleDeleteShelf,
    removeBookFromShelf: handleRemoveBookFromShelf,
    onSortChange,
  };
}
