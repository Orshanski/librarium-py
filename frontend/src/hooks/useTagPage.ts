import { useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { tagScrollContext } from "@/scroll/contexts";
import { useScrollRestore } from "./useScrollRestore";
import { usePathnameWithSearch } from "./usePathnameWithSearch";
import { useOfflineBookIds } from "./useOfflineBookIds";
import { getTag } from "@/api/endpoints/tags";
import type { TagSummary } from "@/api/endpoints/tags";
import { NotFoundError } from "@/api/errors";
import { SORT_CONFIG } from "@/config/sort";
import { useFilterParams } from "./useFilterParams";
import type { FilterKey, SelectedFilters } from "@/api/filter-types";
import { selectedToApiParams } from "@/api/filter-params";
import type { Book } from "@/types";

const EMPTY_BOOKS: Book[] = [];

export interface UseTagPageResult {
  tagId: number;
  tag: TagSummary | null;
  books: Book[];
  loading: boolean;
  notFound: boolean;
  pathnameWithSearch: string;
  sort: string;
  selected: SelectedFilters;
  bookIds: number[];
  offlineBookIds: Set<number>;
  navigateAfterDelete: () => void;
  onSelectionChange: (key: FilterKey, values: string[]) => void;
  clearAllFilters: () => void;
  handleSortChange: (newSort: string) => void;
}

export function useTagPage(): UseTagPageResult {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tagId = Number(id);
  const isInvalidId = !id || Number.isNaN(tagId);
  const pathnameWithSearch = usePathnameWithSearch();

  const sort = searchParams.get("sort") ?? SORT_CONFIG.tag.default;
  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const seriesIds = useMemo(() => searchParams.getAll("seriesIds"), [searchParams]);
  const languages = useMemo(() => searchParams.getAll("language"), [searchParams]);
  // Жанр живёт в пути, а не в фильтрах, поэтому базовый путь включает его id:
  // сброс фильтров оставляет страницу на своём жанре.
  const { selected, onSelectionChange, clearAllFilters, updateParams } = useFilterParams(`/tags/${tagId}`);

  const scrollContext = useMemo(
    () => tagScrollContext({
      key: pathnameWithSearch,
      tagId,
      sort,
      authorIds,
      seriesIds,
      languages,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathnameWithSearch, tagId, sort, authorIds, seriesIds, languages],
  );

  const tagResource = useCachedResource(
    metadataCache,
    `tag/${tagId}`,
    pathnameWithSearch,
    (signal) => {
      if (isInvalidId) return Promise.reject(new NotFoundError(404, "Not found"));
      const apiParams = { ...selectedToApiParams(selected), sort };
      return getTag(tagId, apiParams, signal);
    },
    { context: scrollContext },
  );

  const tag: TagSummary | null = tagResource.data?.tag ?? null;
  const books: Book[] = tagResource.data?.books ?? EMPTY_BOOKS;
  const loading = tagResource.loading;
  const notFound = tagResource.error instanceof NotFoundError || isInvalidId;

  useScrollRestore(!loading, scrollContext);

  // Подписки на tagMerged/tagDeleted покрывают и локальный, и удалённый (SSE) сценарий.
  // Инвариант порядка: handler из registerMetadataCacheHandlers зарегистрирован первым, наша
  // подписка — позже; Set обходится в порядке регистрации; store.invalidate синхронен,
  // React-рендер от useCachedResource асинхронный → navigate уходит до возврата страницы
  // в состояние «Жанр не найден». Если этот порядок изменится, инвариант сломается.
  useEffect(() => {
    if (isInvalidId) return undefined;
    const unsubscribeMerged = domainEvents.subscribe("tagMerged", (payload) => {
      if (payload.sourceId === tagId) {
        navigate(`/tags/${payload.targetId}`);
      }
    });
    const unsubscribeDeleted = domainEvents.subscribe("tagDeleted", (payload) => {
      if (payload.tagId === tagId) {
        navigate("/tags");
      }
    });
    return () => {
      unsubscribeMerged();
      unsubscribeDeleted();
    };
  }, [tagId, navigate, isInvalidId]);

  const navigateAfterDelete = useCallback(() => {
    navigate("/tags");
  }, [navigate]);

  const handleSortChange = useCallback((newSort: string) => {
    updateParams({ sort: [newSort] });
  }, [updateParams]);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);

  return {
    tagId,
    tag,
    books,
    loading,
    notFound,
    pathnameWithSearch,
    sort,
    selected,
    bookIds,
    offlineBookIds,
    navigateAfterDelete,
    onSelectionChange,
    clearAllFilters,
    handleSortChange,
  };
}
