import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import { useScrollRestore } from "../hooks/useScrollRestore";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { setReadingFlag } from "../utils/readerFlag";
import type { Book } from "../types";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { getShelf, deleteShelf, removeBookFromShelf, type ShelfSummary } from "@/api/endpoints/shelves";
import { SORT_CONFIG, shelfSortConfigKey, sortOptionsFor } from "../config/sort";
import { shelfScrollContext } from "@/scroll/contexts";
import { domainEvents } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";

export default function ShelfPage() {
  const { id } = useParams();
  const shelfId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [removedBookIds, setRemovedBookIds] = useState<Set<number>>(() => new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fallback default до первого fetch — реальный default-per-page определяется ниже после load'а
  const sort = searchParams.get("sort") || SORT_CONFIG.shelf_regular.default;
  useEffect(() => {
    setRemovedBookIds(new Set());
  }, [shelfId]);

  const shelfResource = useCachedResource(
    metadataCache,
    `shelf/${shelfId}`,
    location.pathname + location.search,
    (signal) => getShelf(shelfId, { sort }, signal),
  );
  const shelf = shelfResource.data?.shelf ?? null;
  const books = useMemo<Book[]>(
    () => (shelfResource.data?.books || []).filter((book) => !removedBookIds.has(book.id)),
    [shelfResource.data, removedBookIds],
  );
  // For the reading_now system shelf, the server returns per-book progress in
  // a sibling map (not inline on book[]). Use empty object as fallback so the
  // lookup below always returns undefined for non-reading_now shelves.
  const progressByBookId = shelfResource.data?.progressByBookId ?? {};
  const loading = shelfResource.loading;
  const scrollContext = useMemo(
    () => shelfScrollContext({
      key: location.pathname + location.search,
      shelfId,
      systemCode: shelf?.systemCode,
      sort,
    }),
    [location.pathname, location.search, shelfId, shelf?.systemCode, sort],
  );
  useScrollRestore(!loading, scrollContext);

  useEffect(() => {
    if (shelfResource.data) {
      metadataCache.updateContext(`shelf/${shelfId}`, location.pathname + location.search, scrollContext);
    }
  }, [shelfResource.data, shelfId, location.pathname, location.search, scrollContext]);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  async function handleDelete() {
    try {
      await deleteShelf(shelfId);
      domainEvents.publish("shelfDeleted", { shelfId });
      globalThis.dispatchEvent(new Event("shelves-changed"));
      navigate("/");
    } catch (err) {
      console.warn("Failed to delete shelf:", err);
    }
  }

  const handleRemoveBookFromShelf = useCallback(async (bookId: number) => {
    try {
      await removeBookFromShelf(shelfId, bookId);
      domainEvents.publish("shelfMembershipChanged", { shelfId, bookId, hasBook: false });
      setRemovedBookIds((prev) => new Set(prev).add(bookId));
    } catch (err) {
      console.warn("Failed to remove book from shelf:", err);
    }
  }, [shelfId]);

  if (loading) {
    return (
      <>
        <PageHeader title="..." />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!shelf) return null;

  const pageKey = shelfSortConfigKey(shelf.systemCode);
  const cfg = SORT_CONFIG[pageKey];
  const options = cfg.options.length > 0 ? sortOptionsFor(pageKey) : undefined;
  const isReadingNow = shelf.systemCode === "reading_now";

  const shelfOrigin = {
    type: "shelf" as const,
    url: location.pathname + location.search,
    label: shelf.name,
  };

  return (
    <>
      <PageHeader
        title={shelf.name}
        sortOptions={options}
        sortValue={options ? sort : undefined}
        onSortChange={options ? (s) => navigate(`/shelves/${shelfId}?sort=${s}`) : undefined}
        actionSlot={
          !shelf.isSystem ? (
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
              onRemove={!shelf.isSystem ? () => handleRemoveBookFromShelf(b.id) : undefined}
            />
          );
        })}
      </BookGrid>

      {!loading && books.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>На полке нет книг</div>
      )}

      {showDeleteConfirm && (
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
