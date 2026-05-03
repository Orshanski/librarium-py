import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, readSelectedFromSearchParams } from "../components/smart-filter-bar";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { toBook, RawBook } from "../types";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { listBooks, type BookListParams } from "@/api/endpoints/books";
import { sortOptionsFor, SORT_CONFIG } from "../config/sort";
import { metadataCache } from "@/cache";
import { catalogScrollContext } from "@/scroll/contexts";
import type { BookListContext } from "@/domain/read-models";

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;

type CatalogCacheEntry = {
  books: RawBook[];
  hasMore: boolean;
  cursor: number;
};

type CatalogState = {
  urlKey: string;
  books: RawBook[];
  hasMore: boolean;
  cursor: number;
  loading: boolean;
};

function readCatalogCache(url: string): CatalogCacheEntry | null {
  return metadataCache.get<CatalogCacheEntry>("books", url) ?? null;
}

/**
 * Merge a freshly-loaded page of books into the prev state, deduplicating by id
 * and preserving order. Skips the merge if the URL has changed under us
 * (mid-flight nav). Pulled out of the loadMore .then closure so its body isn't
 * nested 5 levels deep.
 */
function mergeNextPage(
  prev: CatalogState,
  newBooks: RawBook[],
  hasMore: boolean,
  urlKey: string,
): CatalogState {
  if (prev.urlKey !== urlKey) return prev;
  const ids = new Set(prev.books.map((b) => b.id));
  const merged = [...prev.books, ...newBooks.filter((b) => !ids.has(b.id))];
  return {
    urlKey: prev.urlKey,
    books: merged,
    hasMore,
    cursor: merged.length,
    loading: false,
  };
}

function writeCatalogCache(url: string, entry: CatalogCacheEntry, context: BookListContext): void {
  metadataCache.set("books", url, entry, { context });
}

// Идемпотентна в пределах одного render-цикла: sessionStorage читается синхронно.
function initialStateFor(url: string): CatalogState {
  const cached = readCatalogCache(url);
  if (cached) {
    return {
      urlKey: url,
      books: cached.books,
      hasMore: cached.hasMore,
      cursor: cached.cursor,
      loading: false,
    };
  }
  return { urlKey: url, books: [], hasMore: false, cursor: 0, loading: true };
}

export default function CatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const sort = searchParams.get("sort") || SORT_CONFIG.catalog.default;
  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const seriesIds = useMemo(() => searchParams.getAll("seriesIds"), [searchParams]);
  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);

  const urlKey = location.pathname + location.search;
  const scrollContext = useMemo(
    () => catalogScrollContext({
      key: urlKey,
      sort,
      authorIds,
      seriesIds,
      tagIds,
      languages: language,
    }),
    [urlKey, sort, authorIds, seriesIds, tagIds, language],
  );

  const [state, setState] = useState<CatalogState>(() => initialStateFor(urlKey));
  const subscribeBooksNamespace = useMemo(() => (handler: () => void) => metadataCache.subscribe("books", handler), []);
  const booksVersion = useSyncExternalStore(
    subscribeBooksNamespace,
    () => metadataCache.version("books"),
    () => metadataCache.version("books"),
  );
  const booksInvalidationVersion = useSyncExternalStore(
    subscribeBooksNamespace,
    () => metadataCache.invalidationVersion("books"),
    () => metadataCache.invalidationVersion("books"),
  );
  const seenBooksVersion = useRef(booksVersion);
  const seenBooksInvalidationVersion = useRef(booksInvalidationVersion);

  // Синхронная реакция на смену URL: пересчитываем state из кэша либо переходим в loading.
  // React бракует рендер после setState-in-render и сразу рендерит новый state — без промежуточного кадра.
  if (state.urlKey !== urlKey) {
    setState(initialStateFor(urlKey));
  }

  const { books, hasMore, cursor, loading } = state;
  const [loadingMore, setLoadingMore] = useState(false);

  useScrollRestore(!loading, scrollContext);

  useEffect(() => {
    if (seenBooksInvalidationVersion.current === booksInvalidationVersion) return;
    seenBooksInvalidationVersion.current = booksInvalidationVersion;
    setLoadingMore(false);
    setState(initialStateFor(urlKey));
  }, [booksInvalidationVersion, urlKey]);

  useEffect(() => {
    if (seenBooksVersion.current === booksVersion) return;
    seenBooksVersion.current = booksVersion;
    const cached = readCatalogCache(urlKey);
    if (!cached) return;
    setState((prev) => {
      if (prev.urlKey !== urlKey) return prev;
      return {
        urlKey,
        books: cached.books,
        hasMore: cached.hasMore,
        cursor: cached.cursor,
        loading: prev.loading,
      };
    });
  }, [booksVersion, urlKey]);

  const buildApiParams = useCallback(
    (c: number, size?: number): BookListParams & { pageSize: number; cursor: number } => {
      const params: BookListParams = {
        sort,
        ...(authorIds.length ? { authorIds } : {}),
        ...(seriesIds.length ? { seriesIds } : {}),
        ...(tagIds.length ? { tagIds } : {}),
        ...(language.length ? { language } : {}),
      };
      return {
        pageSize: size || (c === 0 ? INITIAL_SIZE : PAGE_SIZE),
        cursor: c,
        ...params,
      };
    },
    [sort, authorIds, seriesIds, tagIds, language],
  );

  // Загрузка при loading=true (initial mount без кэша, или смена URL без кэша).
  useEffect(() => {
    if (!state.loading || state.urlKey !== urlKey) return;
    const controller = new AbortController();
    listBooks(buildApiParams(0), controller.signal)
      .then((data) => {
        const next = {
          urlKey,
          books: data.books || [],
          hasMore: data.hasMore || false,
          cursor: (data.books || []).length,
          loading: false,
        };
        writeCatalogCache(urlKey, {
          books: next.books,
          hasMore: next.hasMore,
          cursor: next.cursor,
        }, scrollContext);
        setState(next);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setState({ urlKey, books: [], hasMore: false, cursor: 0, loading: false });
      });
    return () => controller.abort();
  }, [urlKey, state.loading, buildApiParams, scrollContext]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    listBooks(buildApiParams(cursor))
      .then((data) => {
        const newBooks = data.books || [];
        const hasMoreNext = data.hasMore || false;
        setState((prev) => {
          const next = mergeNextPage(prev, newBooks, hasMoreNext, urlKey);
          if (next !== prev) {
            writeCatalogCache(urlKey, {
              books: next.books,
              hasMore: next.hasMore,
              cursor: next.cursor,
            }, scrollContext);
          }
          return next;
        });
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load more books:", err);
        setLoadingMore(false);
      });
  }, [hasMore, loading, loadingMore, buildApiParams, cursor, urlKey, scrollContext]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

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

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    navigate(`/?${params.toString()}`);
  }

  const selected = readSelectedFromSearchParams(searchParams);

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  function clearAllFilters() {
    navigate("/");
  }

  const bookIds = useMemo(() => books.map((b: RawBook) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  return (
    <>
      <PageHeader
        title="Книги"
        filterKeys={["authorIds", "seriesIds", "tagIds", "language"]}
        selected={selected}
        onSelectionChange={onSelectionChange}
        onClearAll={clearAllFilters}
        sortOptions={sortOptionsFor("catalog")}
        sortValue={sort}
        onSortChange={(s) => updateParams({ sort: [s] })}
        showUpload
      />

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      <BookGrid>
        {books.map((b: RawBook) => {
          const book = toBook(b);
          return (
            <BookCard
              key={book.id}
              {...bookToBookCardCommonProps(book)}
              width={cardWidth}
              hasOffline={offlineBookIds.has(book.id)}
              linkState={{ origin: { type: "catalog", url: urlKey, label: "Каталог" } }}
            />
          );
        })}
      </BookGrid>

      {hasMore && (
        <div style={{ textAlign: "center", padding: 32, color: colors.textDim }}>
          {loadingMore ? "Загрузка..." : ""}
        </div>
      )}

      {!loading && books.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Ничего не найдено</div>
      )}
    </>
  );
}
