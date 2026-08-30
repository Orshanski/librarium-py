import { useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getShelf, deleteShelf, removeBookFromShelf, type ShelfSummary, type ShelfProgressEntry } from "@/api/endpoints/shelves";
import { SORT_CONFIG, shelfSortConfigKey, sortOptionsFor, type SortOption } from "../config/sort";
import { shelfScrollContext } from "@/scroll/contexts";
import { metadataCache, useCachedResource } from "@/cache";
import { NotFoundError } from "@/api/errors";
import { useScrollRestore } from "./useScrollRestore";
import { usePathnameWithSearch } from "./usePathnameWithSearch";
import { useRefreshOnReadingNowOnline } from "./useRefreshOnReadingNowOnline";
import type { Book } from "@/types";

export interface UseShelfPageResult {
  shelf: ShelfSummary | null;
  books: Book[];
  loading: boolean;
  notFound: boolean;
  loadFailed: boolean;
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
  const navigate = useNavigate();

  // ВНИМАНИЕ: запасной дефолт всегда от обычной полки. Свой дефолт «Лучшего»
  // (ratingDesc) и «Читаю сейчас» (lastReadDesc) сюда не подставляется — вид полки
  // известен только из ответа. Дефект librarium-py-zkxr.
  const sort = searchParams.get("sort") || SORT_CONFIG.shelf_regular.default;

  const locationKey = usePathnameWithSearch();

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
  // «Полки нет» и «запрос упал» — разные вещи, и путать их нельзя: удалённая на другом
  // устройстве полка должна сказать «не найдена», а не «не удалось загрузить», иначе
  // читатель будет ждать восстановления, которого не будет. Битый идентификатор в
  // адресе (/shelves/abc) — тоже «нет такой», а не сбой.
  const notFound = shelfResource.error instanceof NotFoundError || Number.isNaN(shelfId);
  const loadFailed = shelfResource.error !== undefined && !notFound;

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
      navigate("/");
    } catch (err) {
      console.warn("Failed to delete shelf:", err);
    }
  }, [shelfId, navigate]);

  const handleRemoveBookFromShelf = useCallback(async (bookId: number) => {
    try {
      await removeBookFromShelf(shelfId, bookId);
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
    notFound,
    loadFailed,
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
