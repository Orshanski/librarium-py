import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookDetail from "../components/book-detail";
import type { ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import { Book, toBook, RawBook } from "../types";
import { getBook, listBooks, type BookFileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { NotFoundError } from "@/api/errors";

const FALLBACK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

interface StatusScreenProps {
  title: string;
  message: string;
  crumb: { label: string; href: string; state?: { origin: ListOrigin } };
}

function StatusScreen({ title, message, crumb }: Readonly<StatusScreenProps>) {
  return (
    <>
      <PageHeader title={title} breadcrumb={crumb} />
      <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>{message}</div>
    </>
  );
}

function ignoreAbortAndWarn(label: string) {
  return (err: unknown) => {
    if (err instanceof Error && err.name === "AbortError") return;
    console.warn(label, err);
  };
}

/**
 * Fetch books in the same series, sorted by seriesNumber ascending.
 * Pulled out of the BookPage useEffect chain so the sort callback isn't
 * nested 5 levels deep (S2004).
 */
async function fetchSeriesBooks(seriesId: number, signal: AbortSignal): Promise<RawBook[]> {
  const data = await listBooks(
    { seriesIds: [String(seriesId)], pageSize: 50, sort: "addedDesc" },
    signal,
  );
  return (data.books || []).sort(
    (a: RawBook, b: RawBook) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0),
  );
}

export default function BookPage() {
  const { id } = useParams();
  const location = useLocation();
  const [book, setBook] = useState<RawBook | null>(null);
  const [files, setFiles] = useState<BookFileInfo[]>([]);
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

        if (data.book.series?.id) {
          fetchSeriesBooks(data.book.series.id, controller.signal)
            .then(setSeriesBooks)
            .catch(ignoreAbortAndWarn("Failed to load series books:"));
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
    return <StatusScreen title="..." message="Загрузка..." crumb={crumb} />;
  }

  if (notFound || !book) {
    return <StatusScreen title="Книга не найдена" message="Книга не найдена" crumb={crumb} />;
  }

  const isbn = identifiers.find((i) => i.type === "isbn")?.value || null;
  const bookData: Book = {
    ...toBook(book, { fullCover: true, isbn }),
    formats: files.map((f) => {
      const sz = f.fileSize ?? 0;
      return {
        format: f.format,
        size: sz > 1048576 ? `${(sz / 1048576).toFixed(1)} MB` : `${Math.round(sz / 1024)} KB`,
      };
    }),
  };

  const seriesBooksData: Book[] = seriesBooks.map((b) => toBook(b));

  return (
    <>
      <PageHeader title={book.title} breadcrumb={crumb} />
      <BookDetail book={bookData} seriesBooks={seriesBooksData} bookOrigin={origin} />
    </>
  );
}
