import { useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { useFilterParams } from "../hooks/useFilterParams";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import type { Book } from "../types";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { sortOptionsFor, SORT_CONFIG } from "../config/sort";
import { metadataCache } from "@/cache";
import { useCatalogList } from "@/cache/useCatalogList";
import { catalogScrollContext } from "@/scroll/contexts";

export default function CatalogPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { selected, updateParams, onSelectionChange, clearAllFilters } = useFilterParams("/");

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

  const { books, loading, loadingMore, hasMore } = useCatalogList(metadataCache, {
    urlKey,
    sort,
    authorIds,
    seriesIds,
    tagIds,
    language,
    context: scrollContext,
  });

  useScrollRestore(!loading, scrollContext);

  const bookIds = useMemo(() => books.map((b: Book) => b.id), [books]);
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
        {books.map((book: Book) => (
          <BookCard
            key={book.id}
            {...bookToBookCardCommonProps(book)}
            width={cardWidth}
            hasOffline={offlineBookIds.has(book.id)}
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
