import { useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { authorScrollContext } from "@/scroll/contexts";
import { useScrollRestore } from "./useScrollRestore";
import { readOriginFromState } from "@/components/breadcrumb-origin";
import type { ListOrigin } from "@/components/breadcrumb-origin";
import { getAuthor } from "@/api/endpoints/authors";
import type { Author } from "@/api/endpoints/authors";
import { NotFoundError } from "@/api/errors";
import type { Book } from "@/types";

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
  const pathnameWithSearch = location.pathname + location.search;
  const isInvalidId = !id || Number.isNaN(authorId);

  const scrollContext = useMemo(
    () => authorScrollContext(pathnameWithSearch, authorId),
    [pathnameWithSearch, authorId],
  );

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
      bookCount: authorResource.data?.books?.length ?? 0,
      tags: raw.tags?.map((t) => t.name) ?? [],
    };
  }, [authorResource.data]);

  const books: Book[] = authorResource.data?.books ?? [];

  const loading = authorResource.loading;
  const notFound = authorResource.error instanceof NotFoundError || isInvalidId;

  useScrollRestore(!loading, scrollContext);

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
