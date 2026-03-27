import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getBreadcrumbUrl } from "../utils/breadcrumb-state";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import BookDetail from "../components/book-detail";
import { colors } from "../theme";

export default function BookPage() {
  const { id } = useParams();
  const [book, setBook] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [identifiers, setIdentifiers] = useState<any[]>([]);
  const [seriesBooks, setSeriesBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/books/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.book) {
          setBook(data.book);
          setFiles(data.files || []);
          setIdentifiers(data.identifiers || []);

          // Load series books if book has a series
          if (data.book.series_id) {
            fetch(`/api/books?seriesIds=${data.book.series_id}&pageSize=50&sort=added_desc`)
              .then((r) => r.json())
              .then((seriesData) => {
                const sorted = (seriesData.books || []).sort(
                  (a: any, b: any) => (a.series_number || 0) - (b.series_number || 0)
                );
                setSeriesBooks(sorted);
              });
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Загрузка..." />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </Shell>
    );
  }

  if (!book) {
    return (
      <Shell>
        <PageHeader title="Книга не найдена" />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Книга не найдена</div>
      </Shell>
    );
  }

  // Transform to component format
  const isbn = identifiers.find((i: any) => i.type === "isbn")?.value || null;
  const bookData = {
    id: book.id,
    title: book.title,
    authors: book.authors ? book.authors.split(",") : [],
    series: book.series_name,
    seriesNumber: book.series_number,
    tags: book.tags ? book.tags.split(",") : [],
    rating: book.rating,
    language: book.language || "",
    coverPath: `/api/covers/${book.id}?full=1&t=${book.updated_at || ""}`,
    description: book.description,
    publisher: book.publisher,
    pubDate: book.pub_date,
    formats: files.map((f: any) => ({
      format: f.format,
      size: f.file_size > 1048576
        ? `${(f.file_size / 1048576).toFixed(1)} MB`
        : `${Math.round(f.file_size / 1024)} KB`,
    })),
    isbn,
  };

  const seriesBooksData = seriesBooks.map((b: any) => ({
    id: b.id,
    title: b.title,
    authors: b.authors ? b.authors.split(",") : [],
    series: b.series_name,
    seriesNumber: b.series_number,
    tags: [],
    rating: b.rating,
    language: b.language || "",
    coverPath: `/api/covers/${b.id}`,
    description: null,
    publisher: null,
    pubDate: null,
    formats: [],
    isbn: null,
  }));

  return (
    <Shell>
      <PageHeader title={book.title} breadcrumb={{ label: "Каталог", href: getBreadcrumbUrl("catalog", "/") }} />
      <BookDetail book={bookData} seriesBooks={seriesBooksData} />
    </Shell>
  );
}
