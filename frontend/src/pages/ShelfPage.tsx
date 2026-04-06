import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import { FilterConfig } from "../components/filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { saveBookOrigin } from "../utils/breadcrumb-state";
import { toBook, splitCsv, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";

const sortOptions = [
  { key: "added_desc", label: "По дате добавления" },
  { key: "title_asc", label: "По названию А→Я" },
  { key: "author_asc", label: "По автору А→Я" },
  { key: "rating_desc", label: "По рейтингу" },
];

export default function ShelfPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [shelf, setShelf] = useState<{ id: number; name: string; is_system: boolean; system_code?: string } | null>(null);
  const [books, setBooks] = useState<RawBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("added_desc");

  useEffect(() => {
    fetch(`/api/shelves/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setShelf(data.shelf);
        setBooks(data.books || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    const res = await fetch(`/api/shelves/${id}`, { method: "DELETE" });
    if (res.ok) {
      window.dispatchEvent(new Event("shelves-changed"));
      navigate("/");
    }
  }

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

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

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
          return (
            <BookCard
              key={b.id}
              book={toBook(b)}
              href={isReadingNow && fmt ? `/book/${b.id}/read/${fmt.toLowerCase()}` : undefined}
              progressPercent={isReadingNow && frac ? Math.round(frac * 100) : undefined}
              isCached={cachedBookIds.has(b.id)}
              onRemove={!shelf.is_system ? async () => {
                const res = await fetch(`/api/shelves/${id}/books/${b.id}`, { method: "DELETE" });
                if (res.ok) setBooks(books.filter((x) => x.id !== b.id));
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
