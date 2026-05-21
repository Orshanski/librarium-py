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

  const scrollContext = useMemo(
    () => authorScrollContext(pathnameWithSearch, authorId),
    [pathnameWithSearch, authorId],
  );

  const stateOrigin = readOriginFromState(location.state);
  const parentOriginForBookLink: ListOrigin | undefined =
    stateOrigin && stateOrigin.type !== "book" ? stateOrigin : undefined;
  const crumb: AuthorCrumb = parentOriginForBookLink
    ? { label: parentOriginForBookLink.label, href: parentOriginForBookLink.url }
    : { label: "Авторы", href: "/authors" };

  const authorResource = useCachedResource(
    metadataCache,
    `author/${authorId}`,
    "detail",
    (signal) => (
      !id || Number.isNaN(authorId)
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
      bookCount: authorResource.data?.books?.length || 0,
      tags: raw.tags?.map((t) => t.name) ?? [],
    };
  }, [authorResource.data]);

  const books = useMemo<Book[]>(
    () => authorResource.data?.books || [],
    [authorResource.data],
  );

  const loading = authorResource.loading;
  const notFound = authorResource.error instanceof NotFoundError || !id || Number.isNaN(authorId);

  useScrollRestore(!loading, scrollContext);

  useEffect(() => {
    if (Number.isNaN(authorId)) return undefined;
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
