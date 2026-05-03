import { useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookDetail from "../components/book-detail";
import type { ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import { Book, toBook, RawBook } from "../types";
import { getBook, listBooks, type BookFileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { NotFoundError } from "@/api/errors";
import { metadataCache, useCachedResource } from "@/cache";

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
  const stateOrigin = readOriginFromState(location.state);
  const origin: ListOrigin =
    stateOrigin && stateOrigin.type !== "book" ? stateOrigin : FALLBACK_ORIGIN;

  const crumb = {
    label: origin.label,
    href: origin.url,
    state: origin.parentOrigin ? { origin: origin.parentOrigin } : undefined,
  };

  const bookId = Number(id);
  const bookResource = useCachedResource(
    metadataCache,
    `book/${bookId}`,
    "detail",
    (signal) => (
      !id || isNaN(bookId)
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getBook(bookId, signal)
    ),
  );
  const book = bookResource.data?.book ?? null;
  const files: BookFileInfo[] = bookResource.data?.files || [];
  const identifiers: BookIdentifier[] = bookResource.data?.identifiers || [];
  const seriesId = book?.series?.id ?? null;
  const seriesResource = useCachedResource(
    metadataCache,
    `series/${seriesId ?? "none"}`,
    "book-page-books",
    async (signal) => ({ books: seriesId ? await fetchSeriesBooks(seriesId, signal) : [] }),
  );
  const seriesBooks = useMemo(() => seriesResource.data?.books || [], [seriesResource.data]);
  const loading = bookResource.loading;
  const notFound = bookResource.error instanceof NotFoundError || !id || isNaN(bookId);

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
