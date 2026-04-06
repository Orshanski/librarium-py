import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import EntityAdminPanel from "../components/entity-admin-panel";
import { pluralizeBooks } from "../utils/pluralize";
import { useAuth } from "../auth";
import { toBook, RawBook } from "../types";
import { colors } from "../theme";
import { useCachedBookIds } from "../hooks/useCachedBookIds";

interface SeriesData {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  authors: string | null;
}

export default function SeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [series, setSeries] = useState<SeriesData | null>(null);
  const [books, setBooks] = useState<RawBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    fetch(`/api/series/${id}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFoundState(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setSeries(data.series);
        setBooks(data.books || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

  useEffect(() => {
    if (series) saveBookOrigin(series.name, `/series/${series.id}`);
  }, [series]);

  if (notFoundState) {
    return (
      <>
        <PageHeader title="Серия не найдена" breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Серия не найдена</div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!series) return null;

  const bookCount = series.book_count;

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
      aria-label="Управление серией"
    >⚙</button>
  ) : undefined;

  const infoSlot = (
    <div style={{ display: "flex", gap: 16, fontSize: 13, color: colors.textDim }}>
      <span>{pluralizeBooks(bookCount)}</span>
      {series.authors ? <span>{series.authors}</span> : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title={series.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }}
        infoSlot={infoSlot}
      />

      {showAdmin && series && (
        <EntityAdminPanel
          entityType="series"
          entityId={series.id}
          currentName={series.name}
          bookCount={series.book_count}
          onRenamed={(newName) => { setSeries({...series, name: newName}); setShowAdmin(false); }}
          onMerged={() => window.location.reload()}
          onDeleted={() => navigate("/series")}
        />
      )}

      <BookGrid>
        {books.map((b: RawBook) => (
          <BookCard
            key={b.id}
            book={toBook(b)}
            isCached={cachedBookIds.has(b.id)}
          />
        ))}
      </BookGrid>
    </>
  );
}
