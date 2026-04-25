import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import { useScrollRestore } from "../hooks/useScrollRestore";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { setReadingFlag } from "../utils/readerFlag";
import type { Book, RawBook } from "../types";
import { toBook } from "../types";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { getShelf, deleteShelf, removeBookFromShelf, type ShelfSummary } from "@/api/endpoints/shelves";
import { NotFoundError } from "@/api/errors";
import { SORT_CONFIG, shelfSortConfigKey, sortOptionsFor } from "../config/sort";

export default function ShelfPage() {
  const { id } = useParams();
  const shelfId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [shelf, setShelf] = useState<ShelfSummary | null>(null);
  const [rawBooks, setRawBooks] = useState<RawBook[]>([]);
  const books: Book[] = rawBooks.map((b) => toBook(b));
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useScrollRestore(!loading);

  // Fallback default до первого fetch — реальный default-per-page определяется ниже после load'а
  const sort = searchParams.get("sort") || SORT_CONFIG.shelf_regular.default;

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    getShelf(shelfId, { sort }, controller.signal)
      .then((data) => {
        setShelf(data.shelf);
        setRawBooks(data.books || []);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (err instanceof NotFoundError) return;
        console.warn("Failed to load shelf:", err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [shelfId, sort]);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);

  async function handleDelete() {
    try {
      await deleteShelf(shelfId);
      globalThis.dispatchEvent(new Event("shelves-changed"));
      navigate("/");
    } catch (err) {
      console.warn("Failed to delete shelf:", err);
    }
  }

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
          const readerHref = isReadingNow && b.lastFormat ? `/book/${b.id}/read/${b.lastFormat.toLowerCase()}` : undefined;
          // linkState пробрасывается только для книг, ведущих на /book/:id.
          // Для reader-override (readerHref задан) state для BookPage не нужен.
          const linkState = readerHref ? undefined : { origin: shelfOrigin };
          return (
            <BookCard
              key={b.id}
              book={b}
              href={readerHref}
              onClick={readerHref ? setReadingFlag : undefined}
              progressPercent={isReadingNow && b.fraction ? Math.round(b.fraction * 100) : undefined}
              hasOffline={offlineBookIds.has(b.id)}
              linkState={linkState}
              onRemove={!shelf.isSystem ? async () => {
                try {
                  await removeBookFromShelf(shelfId, b.id);
                  setRawBooks((prev) => prev.filter((x) => x.id !== b.id));
                } catch (err) {
                  console.warn("Failed to remove book from shelf:", err);
                }
              } : undefined}
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
