import { useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { authorScrollContext } from "@/scroll/contexts";
import { useScrollRestore } from "./useScrollRestore";
import { usePathnameWithSearch } from "./usePathnameWithSearch";
import { useEntityScrollContext } from "./useEntityScrollContext";
import { readOriginFromState } from "@/components/breadcrumb-origin";
import type { ListOrigin } from "@/components/breadcrumb-origin";
import { getAuthor } from "@/api/endpoints/authors";
import type { Author } from "@/api/endpoints/authors";
import { NotFoundError } from "@/api/errors";
import type { Book } from "@/types";

const EMPTY_BOOKS: Book[] = [];

export interface AuthorData {
  id: number;
  name: string;
  sortName: string;
  bookCount: number;
  tags: string[];
}

export interface AuthorCrumb {
  label: string;
  href: string;
}

export interface UseAuthorPageResult {
  authorId: number;
  author: AuthorData | null;
  books: Book[];
  loading: boolean;
  notFound: boolean;
  crumb: AuthorCrumb;
  pathnameWithSearch: string;
  parentOriginForBookLink: ListOrigin | undefined;
  navigateAfterDelete: () => void;
}

export function useAuthorPage(): UseAuthorPageResult {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const authorId = Number(id);
  const pathnameWithSearch = usePathnameWithSearch();
  const isInvalidId = !id || Number.isNaN(authorId);

  const scrollContext = useEntityScrollContext(authorScrollContext, pathnameWithSearch, authorId);

  const parentOriginForBookLink = useMemo<ListOrigin | undefined>(() => {
    const stateOrigin = readOriginFromState(location.state);
    return stateOrigin && stateOrigin.type !== "book" ? stateOrigin : undefined;
  }, [location.state]);

  const crumb = useMemo<AuthorCrumb>(
    () => parentOriginForBookLink
      ? { label: parentOriginForBookLink.label, href: parentOriginForBookLink.url }
      : { label: "Авторы", href: "/authors" },
    [parentOriginForBookLink],
  );

  const authorResource = useCachedResource(
    metadataCache,
    `author/${authorId}`,
    "detail",
    (signal) => (
      isInvalidId
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getAuthor(authorId, signal)
    ),
    { context: scrollContext },
  );

  const author = useMemo<AuthorData | null>(() => {
    const raw: Author | undefined = authorResource.data?.author;
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name,
      sortName: raw.sortName ?? "",
      bookCount: raw.bookCount,
      tags: raw.tags?.map((t) => t.name) ?? [],
    };
  }, [authorResource.data]);

  const books: Book[] = authorResource.data?.books ?? EMPTY_BOOKS;

  const loading = authorResource.loading;
  const notFound = authorResource.error instanceof NotFoundError || isInvalidId;

  useScrollRestore(!loading, scrollContext);

  // Подписки на authorMerged/authorDeleted покрывают и локальный, и удалённый (SSE) сценарий.
  // Инвариант порядка: handler из registerMetadataCacheHandlers зарегистрирован первым, наша
  // подписка — позже; Set обходится в порядке регистрации; store.invalidate синхронен,
  // React-рендер от useCachedResource асинхронный → navigate уходит до возврата страницы
  // в состояние «Автор не найден». Если этот порядок изменится, инвариант сломается.
  useEffect(() => {
    if (isInvalidId) return undefined;
    const unsubscribeMerged = domainEvents.subscribe("authorMerged", (payload) => {
      if (payload.sourceId === authorId) {
        navigate(`/authors/${payload.targetId}`);
      }
    });
    const unsubscribeDeleted = domainEvents.subscribe("authorDeleted", (payload) => {
      if (payload.authorId === authorId) {
        navigate("/authors");
      }
    });
    return () => {
      unsubscribeMerged();
      unsubscribeDeleted();
    };
  }, [authorId, navigate]);

  const navigateAfterDelete = useCallback(() => {
    navigate("/authors");
  }, [navigate]);

  return {
    authorId,
    author,
    books,
    loading,
    notFound,
    crumb,
    pathnameWithSearch,
    parentOriginForBookLink,
    navigateAfterDelete,
  };
}
