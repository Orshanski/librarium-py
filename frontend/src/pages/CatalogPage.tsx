import { useState, useEffect, useCallback, useMemo } from "react";
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
import { sortOptionsFor, SORT_CONFIG } from "../config/sort";

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;

export default function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [books, setBooks] = useState<RawBook[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sort = searchParams.get("sort") || SORT_CONFIG.catalog.default;
  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const seriesIds = useMemo(() => searchParams.getAll("seriesIds"), [searchParams]);
  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);

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

  useEffect(() => {
    saveBreadcrumbUrl("catalog", window.location.pathname + window.location.search);
    saveBookOrigin("Каталог", window.location.pathname + window.location.search);

    setLoading(true);
    const controller = new AbortController();
    listBooks(buildApiParams(0), controller.signal)
      .then((data) => {
        setBooks(data.books || []);
        setHasMore(data.hasMore || false);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setBooks([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [buildApiParams]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
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
