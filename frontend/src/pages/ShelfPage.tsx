import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import { FilterConfig } from "../components/filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { saveBookOrigin } from "../utils/breadcrumb-state";
import { setReadingFlag } from "../utils/readerFlag";
import { toBook, splitCsv, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";
import { getShelf, deleteShelf, removeBookFromShelf, type Shelf } from "@/api/endpoints/shelves";
import { NotFoundError } from "@/api/errors";

const sortOptions = [
  { key: "added_desc", label: "По дате добавления" },
  { key: "title_asc", label: "По названию А→Я" },
  { key: "author_asc", label: "По автору А→Я" },
  { key: "rating_desc", label: "По рейтингу" },
];

export default function ShelfPage() {
  const { id } = useParams();
  const shelfId = Number(id);
  const navigate = useNavigate();

  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [books, setBooks] = useState<RawBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("added_desc");

  useEffect(() => {
    getShelf(shelfId)
      .then((data) => {
        setShelf(data.shelf);
        setBooks(data.books || []);
      })
      .catch((err) => {
        if (err instanceof NotFoundError) {
          // shelf not found — leave shelf=null, UI returns null
        } else {
          console.warn("Failed to load shelf:", err);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const sorted = useMemo(() => {
    const list = [...books];
    switch (sort) {
      case "title_asc": return list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
      case "author_asc": return list.sort((a, b) => {
        const aName = splitCsv(a.authors)[0]?.split(" ").pop() || "";
        const bName = splitCsv(b.authors)[0]?.split(" ").pop() || "";
        return aName.localeCompare(bName, "ru");
      });
      case "rating_desc": return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      default: return list;
    }
  }, [books, sort]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    try {
      await deleteShelf(shelfId);
      window.dispatchEvent(new Event("shelves-changed"));
      navigate("/");
    } catch (err) {
      console.warn("Failed to delete shelf:", err);
    }
  }

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

  useEffect(() => {
    if (shelf) saveBookOrigin(shelf.name, `/shelves/${shelf.id}`);
  }, [shelf]);

  if (loading) {
    return (
      <>
        <PageHeader title="..." />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!shelf) return null;

  return (
    <>
      <PageHeader
        title={shelf.name}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={setSort}
        actionSlot={
          !shelf.is_system ? (
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
        {sorted.map((b) => {
          const isReadingNow = shelf.system_code === "reading_now";
          const fmt = b.last_format;
          const frac = b.fraction;
          const readerHref = isReadingNow && fmt ? `/book/${b.id}/read/${fmt.toLowerCase()}` : undefined;
          return (
            <BookCard
              key={b.id}
              book={toBook(b)}
              href={readerHref}
              onClick={readerHref ? setReadingFlag : undefined}
              progressPercent={isReadingNow && frac ? Math.round(frac * 100) : undefined}
              isCached={cachedBookIds.has(b.id)}
              onRemove={!shelf.is_system ? async () => {
                try {
                  await removeBookFromShelf(shelfId, b.id);
                  setBooks(books.filter((x) => x.id !== b.id));
                } catch (err) {
                  console.warn("Failed to remove book from shelf:", err);
                }
              } : undefined}
            />
          );
        })}
      </BookGrid>

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>
          Полка пуста
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog message={`Удалить полку «${shelf.name}»?`} onCancel={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} />
      )}
    </>
  );
}
