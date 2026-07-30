import { useState, useMemo } from "react";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import EntityAdminPanel from "../components/entity-admin-panel";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import { colors } from "../theme";
import { useTagPage } from "../hooks/useTagPage";
import { sortOptionsFor } from "../config/sort";

export default function TagPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const cardWidth = useBookCardWidth();

  const {
    tagId,
    tag,
    books,
    loading,
    notFound,
    pathnameWithSearch,
    sort,
    selected,
    offlineBookIds,
    navigateAfterDelete,
    onSelectionChange,
    clearAllFilters,
    handleSortChange,
  } = useTagPage();

  const [showAdmin, setShowAdmin] = useState(false);

  const bookLinkState = useMemo(
    () =>
      tag
        ? {
            origin: {
              type: "tag" as const,
              url: pathnameWithSearch,
              label: tag.name,
            },
          }
        : undefined,
    [tag, pathnameWithSearch],
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
        onClearAll={clearAllFilters}
        sortOptions={sortOptionsFor("tag")}
        sortValue={sort}
        onSortChange={handleSortChange}
      />

      {!isMobile && showAdmin && (
        <EntityAdminPanel
          entityType="tag"
          entityId={tag.id}
          currentName={tag.name}
          bookCount={tag.bookCount}
          onRenamed={() => setShowAdmin(false)}
          onMerged={() => setShowAdmin(false)}
          onDeleted={() => {
            setShowAdmin(false);
            navigateAfterDelete();
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
