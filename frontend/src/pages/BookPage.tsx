import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getBookOrigin } from "../utils/breadcrumb-state";

import PageHeader from "../components/page-header";
import BookDetail from "../components/book-detail";
import { colors } from "../theme";
import { Book, toBook, RawBook } from "../types";

export default function BookPage() {
  const { id } = useParams();
  const [book, setBook] = useState<RawBook | null>(null);
  const [files, setFiles] = useState<{ format: string; file_size: number }[]>([]);
  const [identifiers, setIdentifiers] = useState<{ type: string; value: string }[]>([]);
  const [seriesBooks, setSeriesBooks] = useState<RawBook[]>([]);
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
      <>
        <PageHeader title="..." breadcrumb={getBookOrigin()} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!book) {
    return (
      <>
        <PageHeader title="Книга не найдена" breadcrumb={getBookOrigin()} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Книга не найдена</div>
      </>
    );
  }

  // Transform to component format
  const isbn = identifiers.find((i) => i.type === "isbn")?.value || null;
  const bookData: Book = {
    ...toBook(book, { fullCover: true, isbn }),
    formats: files.map((f) => ({
      format: f.format,
      size: f.file_size > 1048576
        ? `${(f.file_size / 1048576).toFixed(1)} MB`
        : `${Math.round(f.file_size / 1024)} KB`,
    })),
  };

  const seriesBooksData: Book[] = seriesBooks.map((b) => toBook(b));

  return (
    <>
      <PageHeader title={book.title} breadcrumb={getBookOrigin()} />
      <BookDetail book={bookData} seriesBooks={seriesBooksData} />
    </>
  );
}
