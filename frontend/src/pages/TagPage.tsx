import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import TagAdminPanel from "../components/tag-admin-panel";
import { FilterKey, SelectedFilters, readSelectedFromSearchParams } from "../components/smart-filter-bar";
import { selectedToApiParams } from "../api/filter-params";
import type { Book, RawBook } from "../types";
import { toBook } from "../types";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import { colors } from "../theme";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { getTag, type TagSummary } from "../api/endpoints/tags";
import { NotFoundError } from "@/api/errors";
import { SORT_CONFIG, sortOptionsFor } from "../config/sort";
import { tagScrollContext } from "@/scroll/contexts";

export default function TagPage() {
  const { id } = useParams();
  const tagId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [tag, setTag] = useState<TagSummary | null>(null);
  const [rawBooks, setRawBooks] = useState<RawBook[]>([]);
  const books = useMemo<Book[]>(() => rawBooks.map((b) => toBook(b)), [rawBooks]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const sort = searchParams.get("sort") || SORT_CONFIG.tag.default;
  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const seriesIds = useMemo(() => searchParams.getAll("seriesIds"), [searchParams]);
  const languages = useMemo(() => searchParams.getAll("language"), [searchParams]);
  const scrollContext = useMemo(
    () => tagScrollContext({
      key: location.pathname + location.search,
      tagId,
      sort,
      authorIds,
      seriesIds,
      languages,
    }),
    [location.pathname, location.search, tagId, sort, authorIds, seriesIds, languages],
  );
  useScrollRestore(!loading, scrollContext);

  const selected: SelectedFilters = readSelectedFromSearchParams(searchParams);

  useEffect(() => {
    if (isNaN(tagId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const apiParams = { ...selectedToApiParams(selected), sort };
    getTag(tagId, apiParams, controller.signal)
      .then((data) => {
        setTag(data.tag);
        setRawBooks(data.books);
      })
      .catch((err) => {
        if (err instanceof NotFoundError) {
          setNotFound(true);
        } else {
          console.warn("Failed to fetch tag:", err);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // deps на строковых join(',') — object-идентичность массивов из searchParams.getAll
    // нестабильна между рендерами, сравниваем по содержимому как stable-string.
  }, [tagId, sort, authorIds.join(","), seriesIds.join(","), languages.join(",")]);

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    const qs = params.toString();
    navigate(qs ? `/tags/${tagId}?${qs}` : `/tags/${tagId}`);
  }

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  function handleSortChange(newSort: string) {
    updateParams({ sort: [newSort] });
  }

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  const bookLinkState = useMemo(
    () =>
      tag
        ? {
            origin: {
              type: "tag" as const,
              url: location.pathname + location.search,
              label: tag.name,
            },
          }
        : undefined,
    [tag, location.pathname, location.search],
  );

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={{ label: "Жанры", href: "/tags" }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (notFound || !tag) {
    return (
      <>
        <PageHeader title="Жанр не найден" breadcrumb={{ label: "Жанры", href: "/tags" }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Жанр не найден</div>
      </>
    );
  }

  const adminButton = user?.role === "admin" ? (
    <button
      onClick={() => setShowAdmin(!showAdmin)}
      style={{
        marginLeft: 12,
        padding: 0,
        background: "transparent",
        border: "none",
        color: colors.accent,
        fontSize: 22,
        cursor: "pointer",
        lineHeight: 1,
      }}
      aria-label="Управление жанром"
    >⚙</button>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={tag.name}
        titleSlot={adminButton}
        breadcrumb={{ label: "Жанры", href: "/tags" }}
        filterKeys={["authorIds", "seriesIds", "language"]}
        baseFilters={{ tagIds: [String(tagId)] }}
        selected={selected}
        onSelectionChange={onSelectionChange}
        sortOptions={sortOptionsFor("tag")}
        sortValue={sort}
        onSortChange={handleSortChange}
      />

      {!isMobile && showAdmin && tag && (
        <TagAdminPanel
          tagId={tag.id}
          currentName={tag.name}
          onMapped={(targetId, newName) => {
            if (targetId !== tag.id) {
              navigate(`/tags/${targetId}`);
            } else {
              setTag({ ...tag, name: newName });
              setShowAdmin(false);
            }
          }}
        />
      )}

      <BookGrid>
        {books.map((book) => (
          <BookCard
            key={book.id}
            {...bookToBookCardCommonProps(book)}
            width={cardWidth}
            hasOffline={offlineBookIds.has(book.id)}
            linkState={bookLinkState}
          />
        ))}
        {books.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 14, color: colors.textDim, padding: 24 }}>
            Книги не найдены
          </div>
        )}
      </BookGrid>
    </>
  );
}
