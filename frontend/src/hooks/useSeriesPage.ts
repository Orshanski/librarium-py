import { useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { seriesScrollContext } from "@/scroll/contexts";
import { useScrollRestore } from "./useScrollRestore";
import { usePathnameWithSearch } from "./usePathnameWithSearch";
import { useEntityScrollContext } from "./useEntityScrollContext";
import { readOriginFromState } from "@/components/breadcrumb-origin";
import type { ListOrigin } from "@/components/breadcrumb-origin";
import { getSeries } from "@/api/endpoints/series";
import type { Series } from "@/api/endpoints/series";
import { NotFoundError } from "@/api/errors";
import type { Book } from "@/types";

const EMPTY_BOOKS: Book[] = [];

export interface SeriesCrumb {
  label: string;
  href: string;
}

export interface UseSeriesPageResult {
  seriesId: number;
  series: Series | null;
  books: Book[];
  loading: boolean;
  notFound: boolean;
  crumb: SeriesCrumb;
  pathnameWithSearch: string;
  parentOriginForBookLink: ListOrigin | undefined;
  navigateAfterDelete: () => void;
}

export function useSeriesPage(): UseSeriesPageResult {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const seriesId = Number(id);
  const pathnameWithSearch = usePathnameWithSearch();
  const isInvalidId = !id || Number.isNaN(seriesId);

  const scrollContext = useEntityScrollContext(seriesScrollContext, pathnameWithSearch, seriesId);

  const parentOriginForBookLink = useMemo<ListOrigin | undefined>(() => {
    const stateOrigin = readOriginFromState(location.state);
    return stateOrigin && stateOrigin.type !== "book" ? stateOrigin : undefined;
  }, [location.state]);

  const crumb = useMemo<SeriesCrumb>(
    () => parentOriginForBookLink
      ? { label: parentOriginForBookLink.label, href: parentOriginForBookLink.url }
      : { label: "Серии", href: "/series" },
    [parentOriginForBookLink],
  );

  const seriesResource = useCachedResource(
    metadataCache,
    `series/${seriesId}`,
    "detail",
    (signal) => (
      isInvalidId
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getSeries(seriesId, signal)
    ),
    { context: scrollContext },
  );

  const series: Series | null = seriesResource.data?.series ?? null;
  const books: Book[] = seriesResource.data?.books ?? EMPTY_BOOKS;

  const loading = seriesResource.loading;
  const notFound = seriesResource.error instanceof NotFoundError || isInvalidId;

  useScrollRestore(!loading, scrollContext);

  // Подписки на seriesMerged/seriesDeleted покрывают и локальный, и удалённый (SSE) сценарий.
  // Инвариант порядка: handler из registerMetadataCacheHandlers зарегистрирован первым, наша
  // подписка — позже; Set обходится в порядке регистрации; store.invalidate синхронен,
  // React-рендер от useCachedResource асинхронный → navigate уходит до возврата страницы
  // в состояние «Серия не найдена». Если этот порядок изменится, инвариант сломается.
  useEffect(() => {
    if (isInvalidId) return undefined;
    const unsubscribeMerged = domainEvents.subscribe("seriesMerged", (payload) => {
      if (payload.sourceId === seriesId) {
        navigate(`/series/${payload.targetId}`);
      }
    });
    const unsubscribeDeleted = domainEvents.subscribe("seriesDeleted", (payload) => {
      if (payload.seriesId === seriesId) {
        navigate("/series");
      }
    });
    return () => {
      unsubscribeMerged();
      unsubscribeDeleted();
    };
  }, [seriesId, navigate]);

  const navigateAfterDelete = useCallback(() => {
    navigate("/series");
  }, [navigate]);

  return {
    seriesId,
    series,
    books,
    loading,
    notFound,
    crumb,
    pathnameWithSearch,
    parentOriginForBookLink,
    navigateAfterDelete,
  };
}
