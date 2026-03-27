import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getBreadcrumbUrl } from "../utils/breadcrumb-state";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";

interface SeriesData {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  authors: string | null;
}

export default function SeriesPage() {
  const { id } = useParams();

  const [series, setSeries] = useState<SeriesData | null>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

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

  if (notFoundState) {
    return (
      <Shell>
        <PageHeader title="Серия не найдена" breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Серия не найдена</div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="..." breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </Shell>
    );
  }

  if (!series) return null;

  const infoSlot = (
    <div style={{ display: "flex", gap: 16, fontSize: 13, color: colors.textDim }}>
      <span>{series.authors}</span>
      <span>
        {pluralizeBooks(series.book_count)}
      </span>
    </div>
  );

  return (
    <Shell>
      <PageHeader
        title={series.name}
        breadcrumb={{ label: "Серии", href: getBreadcrumbUrl("series", "/series") }}
        infoSlot={infoSlot}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 150px)",
          gap: 24,
        }}
      >
        {books.map((b: any) => (
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
          />
        ))}
      </div>
    </Shell>
  );
}
