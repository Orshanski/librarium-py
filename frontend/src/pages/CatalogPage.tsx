import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterConfig } from "../components/filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { saveBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";
import { toBook, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";

interface FilterOption {
  id: number;
  name: string;
  count: number;
}

interface FilterOptions {
  authors: FilterOption[];
  series: FilterOption[];
  tags: FilterOption[];
  languages: { name: string; count: number }[];
}

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;
const CACHE_KEY = "librarium_catalog";

const sortOptions = [
  { key: "added_desc", label: "По дате добавления" },
  { key: "title_asc", label: "По названию А→Я" },
  { key: "title_desc", label: "По названию Я→А" },
  { key: "author_asc", label: "По автору А→Я" },
  { key: "rating_desc", label: "По рейтингу" },
];

function saveCache(books: RawBook[], filterOptions: FilterOptions | null, hasMore: boolean, paramsKey: string) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      books,
      filterOptions,
      hasMore,
      paramsKey,
      scrollTop: main?.scrollTop || 0,
    }));
    saveBreadcrumbUrl("catalog", window.location.pathname + window.location.search);
    saveBookOrigin("Каталог", "/");
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

  useEffect(() => {
    saveBookOrigin("Каталог", "/");
  }, []);

  const [books, setBooks] = useState<RawBook[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sort = searchParams.get("sort") || "added_desc";
  const authorIds = searchParams.get("authorIds") || "";
  const seriesIds = searchParams.get("seriesIds") || "";
  const tagIds = searchParams.get("tagIds") || "";
  const language = searchParams.get("language") || "";
  const paramsKey = `${sort}|${authorIds}|${seriesIds}|${tagIds}|${language}`;

  function buildApiUrl(cursor: number, size?: number) {
    const params = new URLSearchParams();
    params.set("pageSize", String(size || (cursor === 0 ? INITIAL_SIZE : PAGE_SIZE)));
    params.set("sort", sort);
    params.set("cursor", String(cursor));
    if (authorIds) params.set("authorIds", authorIds);
    if (seriesIds) params.set("seriesIds", seriesIds);
    if (tagIds) params.set("tagIds", tagIds);
    if (language) params.set("language", language);
    return `/api/books?${params.toString()}`;
  }

  // Load: restore from cache or fetch fresh
  useEffect(() => {
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/", { replace: true });
    }
    const cached = fresh ? null : loadCache(paramsKey);
    if (cached) {
      setBooks(cached.books);
      setFilterOptions(cached.filterOptions);
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
    fetch(buildApiUrl(0))
      .then((r) => r.json())
      .then((data) => {
        setBooks(data.books || []);
        setFilterOptions(data.filterOptions || null);
        setHasMore(data.hasMore || false);
        setLoading(false);
        frozenRef.current = false;
      })
      .catch(() => setLoading(false));
  }, [paramsKey]);

  // Lazy load
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || frozenRef.current) return;
    setLoadingMore(true);
    fetch(buildApiUrl(books.length))
      .then((r) => r.json())
      .then((data) => {
        const newBooks = data.books || [];
        setBooks((prev) => {
          const ids = new Set(prev.map((b: RawBook) => b.id));
          return [...prev, ...newBooks.filter((b: RawBook) => !ids.has(b.id))];
        });
        setHasMore(data.hasMore || false);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [books.length, hasMore, loadingMore, sort, authorIds, seriesIds, tagIds, language]);

  // Scroll listener for lazy load + cache save
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      // Save scroll position to cache
      saveCache(books, filterOptions, hasMore, paramsKey);

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
  }, [loadMore, books, filterOptions, hasMore, paramsKey]);

  // URL param helpers
  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    sessionStorage.removeItem(CACHE_KEY);
    navigate(`/?${params.toString()}`);
  }

  // Build filter configs
  const selected: Record<string, string[]> = {};
  if (authorIds) selected.author = authorIds.split(",");
  if (seriesIds) selected.series = seriesIds.split(",");
  if (tagIds) selected.genre = tagIds.split(",");
  if (language) selected.language = [language];

  const filterConfigs: FilterConfig[] = filterOptions
    ? [
        { key: "author", label: "Автор", options: filterOptions.authors.map((a) => ({ value: String(a.id), count: a.count, label: a.name })) },
        { key: "series", label: "Серия", options: filterOptions.series.map((s) => ({ value: String(s.id), count: s.count, label: s.name })) },
        { key: "genre", label: "Жанр", options: filterOptions.tags.map((t) => ({ value: String(t.id), count: t.count, label: t.name })) },
        { key: "language", label: "Язык", options: filterOptions.languages.map((l) => ({ value: l.name, count: l.count })) },
      ]
    : [];

  function onSelectionChange(key: string, values: string[]) {
    const paramMap: Record<string, string> = { author: "authorIds", series: "seriesIds", genre: "tagIds", language: "language" };
    const paramKey = paramMap[key];
    updateParams({ [paramKey]: paramKey === "language" ? (values[0] || undefined) : (values.length > 0 ? values.join(",") : undefined) });
  }

  function clearAllFilters() {
    sessionStorage.removeItem(CACHE_KEY);
    navigate("/");
  }

  const filterBarProps = filterConfigs.length > 0 ? { filters: filterConfigs, selected, onSelectionChange, onClearAll: clearAllFilters } : undefined;

  const bookIds = useMemo(() => books.map((b: RawBook) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

  return (
    <>
      <PageHeader
        title="Книги"
        {...filterBarProps}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(s) => updateParams({ sort: s })}
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
