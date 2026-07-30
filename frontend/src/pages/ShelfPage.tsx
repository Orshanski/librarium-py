import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { setReadingFlag } from "../utils/readerFlag";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { useShelfPage } from "../hooks/useShelfPage";

export default function ShelfPage() {
  const { id } = useParams();
  const shelfId = Number(id);

  const {
    shelf,
    books,
    loading,
    isReadingNow,
    progressByBookId,
    sort,
    options,
    pathnameWithSearch,
    deleteShelf: handleDelete,
    removeBookFromShelf: handleRemoveBookFromShelf,
    onSortChange,
  } = useShelfPage(shelfId);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  const shelfOrigin = {
    type: "shelf" as const,
    url: pathnameWithSearch,
    label: shelf?.name ?? "",
  };

  return (
    <>
      <PageHeader
        title={shelf?.name ?? "..."}
        sortOptions={options}
        sortValue={options ? sort : undefined}
        onSortChange={options ? onSortChange : undefined}
        actionSlot={
          shelf && !shelf.isSystem ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: "none",
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                color: colors.danger,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              Удалить полку
            </button>
          ) : undefined
        }
      />

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      <BookGrid>
        {books.map((b) => {
          const progress = progressByBookId[b.id];
          const readerHref = isReadingNow && progress?.lastFormat
            ? `/book/${b.id}/read/${progress.lastFormat.toLowerCase()}`
            : undefined;
          // linkState пробрасывается только для книг, ведущих на /book/:id.
          // Для reader-override (readerHref задан) state для BookPage не нужен.
          const linkState = readerHref ? undefined : { origin: shelfOrigin };
          return (
            <BookCard
              key={b.id}
              {...bookToBookCardCommonProps(b)}
              width={cardWidth}
              href={readerHref || `/book/${b.id}`}
              onClick={readerHref ? setReadingFlag : undefined}
              progressPercent={isReadingNow && progress?.fraction ? Math.round(progress.fraction * 100) : undefined}
              hasOffline={offlineBookIds.has(b.id)}
              linkState={linkState}
              onRemove={shelf && !shelf.isSystem ? () => handleRemoveBookFromShelf(b.id) : undefined}
            />
          );
        })}
      </BookGrid>

      {!loading && books.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>На полке нет книг</div>
      )}

      {showDeleteConfirm && shelf && (
        <ConfirmDialog
          message={`Удалить полку «${shelf.name}»? Все связи с книгами будут удалены. Книги останутся в библиотеке.`}
          confirmLabel="Удалить"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
