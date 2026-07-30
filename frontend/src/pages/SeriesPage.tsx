import { useState, useMemo } from "react";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import EntityAdminPanel from "../components/entity-admin-panel";
import { pluralizeBooks } from "../utils/pluralize";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import type { Book } from "../types";
import { colors } from "../theme";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { useSeriesPage } from "../hooks/useSeriesPage";

export default function SeriesPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const {
    series,
    books,
    loading,
    notFound,
    crumb,
    pathnameWithSearch,
    parentOriginForBookLink,
    navigateAfterDelete,
  } = useSeriesPage();

  const [showAdmin, setShowAdmin] = useState(false);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  // См. TagPage: загрузка кончилась, данных нет — 404 или сбой запроса.
  if (notFound || (!loading && !series)) {
    return (
      <>
        <PageHeader title="Серия не найдена" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Серия не найдена</div>
      </>
    );
  }

  const adminButton = user?.role === "admin" && series ? (
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
      aria-label="Управление серией"
    >⚙</button>
  ) : undefined;

  const infoSlot = series ? (
    <div style={{ display: "flex", gap: 16, fontSize: 13, color: colors.textDim }}>
      <span>{pluralizeBooks(series.bookCount)}</span>
      {series.authors && series.authors.length > 0 && <span>{series.authors.map((a) => a.name).join(", ")}</span>}
    </div>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={series?.name ?? "..."}
        titleSlot={adminButton}
        breadcrumb={crumb}
        infoSlot={infoSlot}
      />

      {!isMobile && showAdmin && series && (
        <EntityAdminPanel
          entityType="series"
          entityId={series.id}
          currentName={series.name}
          bookCount={series.bookCount}
          onRenamed={() => setShowAdmin(false)}
          onMerged={() => setShowAdmin(false)}
          onDeleted={() => {
            setShowAdmin(false);
            // Страховка поверх подписки хука на seriesDeleted: основная навигация — через подписку,
            // эта строка защищает от изменений порядка publish/callback в EntityAdminPanel.
            navigateAfterDelete();
          }}
        />
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      {series && (
      <BookGrid>
        {books.map((book: Book) => (
          <BookCard
            key={book.id}
            {...bookToBookCardCommonProps(book)}
            width={cardWidth}
            hasOffline={offlineBookIds.has(book.id)}
            linkState={{
              origin: {
                type: "series",
                url: pathnameWithSearch,
                label: series.name,
                ...(parentOriginForBookLink ? { parentOrigin: parentOriginForBookLink } : {}),
              },
            }}
          />
        ))}
      </BookGrid>
      )}
    </>
  );
}
