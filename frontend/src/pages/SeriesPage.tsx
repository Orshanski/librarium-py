import { useState, useMemo } from "react";
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
import { useIsMobile } from "../responsive";
import { toBook, RawBook } from "../types";
import { colors } from "../theme";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { getSeries } from "../api/endpoints/series";
import type { Series } from "../api/endpoints/series";
import { NotFoundError } from "@/api/errors";
import { seriesScrollContext } from "@/scroll/contexts";
import { metadataCache, useCachedResource } from "@/cache";

export default function SeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [showAdmin, setShowAdmin] = useState(false);

  const seriesId = Number(id);
  const scrollContext = useMemo(
    () => seriesScrollContext(location.pathname + location.search, seriesId),
    [location.pathname, location.search, seriesId],
  );

  const stateOrigin = readOriginFromState(location.state);
  const crumb =
    stateOrigin && stateOrigin.type !== "book"
      ? { label: stateOrigin.label, href: stateOrigin.url }
      : { label: "Серии", href: "/series" };

  const seriesResource = useCachedResource(
    metadataCache,
    `series/${seriesId}`,
    "detail",
    (signal) => (
      !id || isNaN(seriesId)
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getSeries(seriesId, signal)
    ),
    { context: scrollContext },
  );
  const series = seriesResource.data?.series ?? null;
  const books = useMemo(() => seriesResource.data?.books || [], [seriesResource.data]);
  const loading = seriesResource.loading;
  const notFoundState = seriesResource.error instanceof NotFoundError || !id || isNaN(seriesId);
  useScrollRestore(!loading, scrollContext);

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
        breadcrumb={crumb}
        infoSlot={infoSlot}
      />

      {!isMobile && showAdmin && series && (
        <EntityAdminPanel
          entityType="series"
          entityId={series.id}
          currentName={series.name}
          bookCount={series.bookCount}
          onRenamed={(newName) => {
            if (seriesResource.data) {
              metadataCache.set(`series/${series.id}`, "detail", {
                ...seriesResource.data,
                series: { ...seriesResource.data.series, name: newName },
              }, { context: scrollContext });
            }
            setShowAdmin(false);
          }}
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
