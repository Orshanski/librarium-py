import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { toBook, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { getCacheVersion } from "../utils/cache-invalidation";
import { listBooks, type BookListParams } from "@/api/endpoints/books";
import { sortOptionsFor, SORT_CONFIG } from "../config/sort";

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;
const CATALOG_CACHE_KEY = "librarium_catalog_cache";

type CatalogCacheEntry = {
  books: RawBook[];
  hasMore: boolean;
  cursor: number;
  version: number;
};

type CatalogState = {
  urlKey: string;
  books: RawBook[];
  hasMore: boolean;
  cursor: number;
  loading: boolean;
};

function readCatalogCache(url: string): CatalogCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const map: Record<string, CatalogCacheEntry> = JSON.parse(raw);
    const entry = map[url];
    if (!entry || entry.version !== getCacheVersion()) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCatalogCache(url: string, entry: CatalogCacheEntry): void {
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
    const map: Record<string, CatalogCacheEntry> = raw ? JSON.parse(raw) : {};
    map[url] = entry;
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
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
  const [searchParams] = useSearchParams();

  const sort = searchParams.get("sort") || SORT_CONFIG.catalog.default;
  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const seriesIds = useMemo(() => searchParams.getAll("seriesIds"), [searchParams]);
  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);

  const urlKey = window.location.pathname + window.location.search;

  const [state, setState] = useState<CatalogState>(() => initialStateFor(urlKey));

  // Синхронная реакция на смену URL: пересчитываем state из кэша либо переходим в loading.
  // React бракует рендер после setState-in-render и сразу рендерит новый state — без промежуточного кадра.
  if (state.urlKey !== urlKey) {
    setState(initialStateFor(urlKey));
  }

  const { books, hasMore, cursor, loading } = state;
  const [loadingMore, setLoadingMore] = useState(false);

  // Актуальный state через ref: cleanup-эффект ниже должен видеть state предыдущего commit,
  // не stale-замыкание. ref обновляется на каждом commit (useEffect без deps).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useScrollRestore(!loading);

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
        setState({
          urlKey,
          books: data.books || [],
          hasMore: data.hasMore || false,
          cursor: (data.books || []).length,
          loading: false,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setState({ urlKey, books: [], hasMore: false, cursor: 0, loading: false });
      });
    return () => controller.abort();
  }, [urlKey, state.loading, buildApiParams]);

  // Cleanup — сохранить запись при unmount/смене url.
  // Защита current.urlKey === urlKey: пишем только если state и ключ эффекта относятся к одному URL.
  useEffect(() => {
    return () => {
      const current = stateRef.current;
      if (!current.loading && current.urlKey === urlKey) {
        writeCatalogCache(urlKey, {
          books: current.books,
          hasMore: current.hasMore,
          cursor: current.cursor,
          version: getCacheVersion(),
        });
      }
    };
  }, [urlKey]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    listBooks(buildApiParams(cursor))
      .then((data) => {
        const newBooks = data.books || [];
        setState((prev) => {
          if (prev.urlKey !== urlKey) return prev;
          const ids = new Set(prev.books.map((b) => b.id));
          const merged = [...prev.books, ...newBooks.filter((b) => !ids.has(b.id))];
          return {
            urlKey: prev.urlKey,
            books: merged,
            hasMore: data.hasMore || false,
            cursor: merged.length,
            loading: false,
          };
        });
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load more books:", err);
        setLoadingMore(false);
      });
  }, [hasMore, loading, loadingMore, buildApiParams, cursor, urlKey]);

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

  const selected: SelectedFilters = {};
  if (authorIds.length) selected.authorIds = authorIds;
  if (seriesIds.length) selected.seriesIds = seriesIds;
  if (tagIds.length) selected.tagIds = tagIds;
  if (language.length) selected.language = language;

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  function clearAllFilters() {
    navigate("/");
  }

  const bookIds = useMemo(() => books.map((b: RawBook) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

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
        {books.map((b: RawBook) => (
          <BookCard
            key={b.id}
            book={toBook(b)}
            isCached={cachedBookIds.has(b.id)}
            linkState={{ origin: { type: "catalog", url: urlKey, label: "Каталог" } }}
          />
        ))}
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
