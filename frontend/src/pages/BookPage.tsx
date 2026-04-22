import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookDetail from "../components/book-detail";
import type { ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import { Book, toBook, RawBook } from "../types";
import { getBook, listBooks, type FileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { NotFoundError } from "@/api/errors";

const FALLBACK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

export default function BookPage() {
  const { id } = useParams();
  const location = useLocation();
  const [book, setBook] = useState<RawBook | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [identifiers, setIdentifiers] = useState<BookIdentifier[]>([]);
  const [seriesBooks, setSeriesBooks] = useState<RawBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const stateOrigin = readOriginFromState(location.state);
  const origin: ListOrigin =
    stateOrigin && stateOrigin.type !== "book" ? stateOrigin : FALLBACK_ORIGIN;

  const crumb = {
    label: origin.label,
    href: origin.url,
    state: origin.parentOrigin ? { origin: origin.parentOrigin } : undefined,
  };

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    setLoading(true);
    setNotFound(false);

    getBook(Number(id), controller.signal)
      .then((data) => {
        setBook(data.book);
        setFiles(data.files || []);
        setIdentifiers(data.identifiers || []);

        if (data.book.series_id) {
          listBooks(
            { seriesIds: [String(data.book.series_id)], pageSize: 50, sort: "addedDesc" },
            controller.signal,
          )
            .then((seriesData) => {
              const sorted = (seriesData.books || []).sort(
                (a: RawBook, b: RawBook) =>
                  (a.series_number ?? 0) - (b.series_number ?? 0),
              );
              setSeriesBooks(sorted);
            })
            .catch((err: unknown) => {
              if (err instanceof Error && err.name === "AbortError") return;
              console.warn("Failed to load series books:", err);
            });
        }

        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (err instanceof NotFoundError) {
          setNotFound(true);
        } else {
          console.warn("Failed to load book:", err);
        }
        setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (notFound || !book) {
    return (
      <>
        <PageHeader title="Книга не найдена" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Книга не найдена</div>
      </>
    );
  }

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
      <PageHeader title={book.title} breadcrumb={crumb} />
      <BookDetail book={bookData} seriesBooks={seriesBooksData} bookOrigin={origin} />
    </>
  );
}
