import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/confirm-dialog";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import { FilterConfig } from "../components/filter-bar";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors } from "../theme";
import { saveBookOrigin } from "../utils/breadcrumb-state";

const sortOptions = [
  { key: "added_desc", label: "По дате добавления" },
  { key: "title_asc", label: "По названию А→Я" },
  { key: "author_asc", label: "По автору А→Я" },
  { key: "rating_desc", label: "По рейтингу" },
];

export default function ShelfPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [shelf, setShelf] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
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
        const aName = (a.authors || "").split(",")[0].trim().split(" ").pop() || "";
        const bName = (b.authors || "").split(",")[0].trim().split(" ").pop() || "";
        return aName.localeCompare(bName, "ru");
      });
      case "rating_desc": return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      default: return list;
    }
  }, [books, sort]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    const res = await fetch(`/api/shelves/${id}`, { method: "DELETE" });
    if (res.ok) navigate("/");
  }

  useEffect(() => {
    if (shelf) saveBookOrigin(shelf.name, `/shelves/${shelf.id}`);
  }, [shelf]);

  if (loading) {
    return (
      <Shell>
        <PageHeader title="..." />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </Shell>
    );
  }

  if (!shelf) return null;

  return (
    <Shell>
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
        {sorted.map((b: any) => (
          <BookCard
            key={b.id}
            book={{
              id: b.id,
              title: b.title,
              authors: b.authors ? b.authors.split(",") : [],
              series: b.series_name,
              seriesNumber: b.series_number,
              tags: b.tags ? b.tags.split(",") : [],
              rating: b.rating,
              language: b.language || "",
              coverPath: `/api/covers/${b.id}?t=${b.updated_at || ""}`,
              description: b.description,
              publisher: b.publisher,
              pubDate: b.pub_date,
              formats: [],
              isbn: null,
            }}
            onRemove={!shelf.is_system ? async () => {
              const res = await fetch(`/api/shelves/${id}/books/${b.id}`, { method: "DELETE" });
              if (res.ok) setBooks(books.filter((x: any) => x.id !== b.id));
            } : undefined}
          />
        ))}
      </BookGrid>

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>
          Полка пуста
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog message={`Удалить полку «${shelf.name}»?`} onCancel={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} />
      )}
    </Shell>
  );
}
