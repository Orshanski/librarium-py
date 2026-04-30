import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { readOriginFromState } from "../components/breadcrumb-origin";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import EntityAdminPanel from "../components/entity-admin-panel";
import { pluralizeBooks } from "../utils/pluralize";
import { useAuth } from "../auth";
import { toBook, RawBook } from "../types";
import { colors } from "../theme";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { getSeries } from "../api/endpoints/series";
import type { Series } from "../api/endpoints/series";
import { NotFoundError } from "@/api/errors";

export default function SeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [series, setSeries] = useState<Series | null>(null);
  const [books, setBooks] = useState<RawBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useScrollRestore(!loading);

  const stateOrigin = readOriginFromState(location.state);
  const crumb =
    stateOrigin && stateOrigin.type !== "book"
      ? { label: stateOrigin.label, href: stateOrigin.url }
      : { label: "Серии", href: "/series" };

  useEffect(() => {
    const numericId = Number(id);
    if (!id || isNaN(numericId)) {
      setNotFoundState(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    getSeries(numericId, controller.signal)
      .then((data) => {
        setSeries(data.series);
        setBooks(data.books || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (err instanceof NotFoundError) {
          setNotFoundState(true);
        } else {
          console.warn("Failed to fetch series:", err);
        }
        setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  if (notFoundState) {
    return (
      <>
        <PageHeader title="Серия не найдена" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Серия не найдена</div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!series) return null;

  const bookCount = series.bookCount;

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
      {series.authors && series.authors.length > 0 && <span>{series.authors.map((a) => a.name).join(", ")}</span>}
    </div>
  );

  return (
    <>
      <PageHeader
        title={series.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        breadcrumb={crumb}
        infoSlot={infoSlot}
      />

      {showAdmin && series && (
        <EntityAdminPanel
          entityType="series"
          entityId={series.id}
          currentName={series.name}
          bookCount={series.bookCount}
          onRenamed={(newName) => { setSeries({...series, name: newName}); setShowAdmin(false); }}
          onMerged={() => globalThis.location.reload()}
          onDeleted={() => navigate("/series")}
        />
      )}

      <BookGrid>
        {books.map((b: RawBook) => {
          const book = toBook(b);
          return (
            <BookCard
              key={book.id}
              {...bookToBookCardCommonProps(book)}
              width={cardWidth}
              hasOffline={offlineBookIds.has(book.id)}
              linkState={{
                origin: {
                  type: "series",
                  url: location.pathname + location.search,
                  label: series.name,
                  ...(stateOrigin && stateOrigin.type !== "book"
                    ? { parentOrigin: stateOrigin }
                    : {}),
                },
              }}
            />
          );
        })}
      </BookGrid>
    </>
  );
}
