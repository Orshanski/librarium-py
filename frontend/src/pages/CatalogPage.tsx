import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { saveBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";
import { toBook, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";
import { listBooks, type BookListParams } from "@/api/endpoints/books";

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;
const CACHE_KEY = "librarium_catalog_v2";

const sortOptions = [
  { key: "added_desc", label: "По дате добавления" },
  { key: "title_asc", label: "По названию А→Я" },
  { key: "title_desc", label: "По названию Я→А" },
  { key: "author_asc", label: "По автору А→Я" },
  { key: "rating_desc", label: "По рейтингу" },
];

function saveCache(books: RawBook[], hasMore: boolean, paramsKey: string) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      books,
      hasMore,
      paramsKey,
      scrollTop: main?.scrollTop || 0,
    }));
  } catch {}
}

function loadCache(paramsKey: string) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.paramsKey !== paramsKey) return null;
    if (!data.books?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const frozenRef = useRef(false); // block lazy load after restore

  const [books, setBooks] = useState<RawBook[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sort = searchParams.get("sort") || "added_desc";
  const authorIds = searchParams.getAll("authorIds");
  const seriesIds = searchParams.getAll("seriesIds");
  const tagIds = searchParams.getAll("tagIds");
  const language = searchParams.getAll("language");
  const paramsKey = `${sort}|${authorIds.join(",")}|${seriesIds.join(",")}|${tagIds.join(",")}|${language.join(",")}`;

  const buildApiParams = useCallback((cursor: number, size?: number) => {
    const params: BookListParams = {
      sort,
      ...(authorIds.length ? { authorIds } : {}),
      ...(seriesIds.length ? { seriesIds } : {}),
      ...(tagIds.length ? { tagIds } : {}),
      ...(language.length ? { language } : {}),
    };
    return {
      pageSize: size || (cursor === 0 ? INITIAL_SIZE : PAGE_SIZE),
      cursor,
      ...params,
    };
  }, [sort, authorIds, seriesIds, tagIds, language]);

  // Load: restore from cache or fetch fresh
  useEffect(() => {
    saveBreadcrumbUrl("catalog", window.location.pathname + window.location.search);
    saveBookOrigin("Каталог", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/", { replace: true });
    }
    const cached = fresh ? null : loadCache(paramsKey);
    if (cached) {
      setBooks(cached.books);
      setHasMore(cached.hasMore);
      setLoading(false);
      frozenRef.current = true;
      // Restore scroll after render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = cached.scrollTop;
          // Unfreeze lazy load after scroll is restored
          setTimeout(() => { frozenRef.current = false; }, 200);
        });
      });
      return;
    }

    setLoading(true);
    sessionStorage.removeItem(CACHE_KEY);
    const controller = new AbortController();
    listBooks(buildApiParams(0), controller.signal)
      .then((data) => {
        setBooks(data.books || []);
        setHasMore(data.hasMore || false);
        setLoading(false);
        frozenRef.current = false;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setBooks([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [paramsKey, buildApiParams]);

  // Lazy load
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || frozenRef.current) return;
    setLoadingMore(true);
    listBooks(buildApiParams(books.length))
      .then((data) => {
        const newBooks = data.books || [];
        setBooks((prev) => {
          const ids = new Set(prev.map((b: RawBook) => b.id));
          return [...prev, ...newBooks.filter((b: RawBook) => !ids.has(b.id))];
        });
        setHasMore(data.hasMore || false);
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load more books:", err);
        setLoadingMore(false);
      });
  }, [books.length, hasMore, loadingMore, buildApiParams]);

  // Scroll listener for lazy load + cache save
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      // Save scroll position to cache
      saveCache(books, hasMore, paramsKey);

      // Lazy load trigger
      if (!frozenRef.current && main!.scrollTop + main!.clientHeight >= main!.scrollHeight - 300) {
        loadMore();
      }
    }

    function check() {
      if (!frozenRef.current && main!.scrollHeight <= main!.clientHeight) {
        loadMore();
      }
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    const timer = setTimeout(check, 300);
    return () => {
      main.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [loadMore, books, hasMore, paramsKey]);

  // URL param helpers
  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    sessionStorage.removeItem(CACHE_KEY);
    navigate(`/?${params.toString()}`);
  }

  // Build selected filters from URL params
  const selected: SelectedFilters = {};
  if (authorIds.length) selected.authorIds = authorIds;
  if (seriesIds.length) selected.seriesIds = seriesIds;
  if (tagIds.length) selected.tagIds = tagIds;
  if (language.length) selected.language = language;

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  function clearAllFilters() {
    sessionStorage.removeItem(CACHE_KEY);
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
        sortOptions={sortOptions}
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
