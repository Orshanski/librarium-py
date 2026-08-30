import { useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookEditForm from "../components/book-edit-form";
import { BookEditOptions, BookSavePayload } from "../components/book-edit-form.types";
import type { BookContextOrigin, ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import type { BookDetail, BookFormat } from "../types";
import { getBook, updateBook, type BookFileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { listFilterOptions, listPublishers } from "@/api/endpoints/filters";
import { metadataCache, useCachedResource } from "@/cache";
import { NotFoundError } from "@/api/errors";

const FALLBACK_BOOK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

export default function BookEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const stateOrigin = readOriginFromState(location.state);
  const editOrigin: BookContextOrigin | undefined =
    stateOrigin?.type === "book" ? stateOrigin : undefined;

  const bookId = Number(id);
  const bookResource = useCachedResource(
    metadataCache,
    `book/${bookId}`,
    "detail",
    (signal) => (
      !id || Number.isNaN(bookId)
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getBook(bookId, signal)
    ),
  );
  const authorsResource = useCachedResource(
    metadataCache,
    "filter-options/authors",
    "all",
    (signal) => listFilterOptions("authors", {}, signal),
  );
  const seriesResource = useCachedResource(
    metadataCache,
    "filter-options/series",
    "all",
    (signal) => listFilterOptions("series", {}, signal),
  );
  const tagsResource = useCachedResource(
    metadataCache,
    "filter-options/tags",
    "all",
    (signal) => listFilterOptions("tags", {}, signal),
  );
  const languagesResource = useCachedResource(
    metadataCache,
    "filter-options/languages",
    "all",
    (signal) => listFilterOptions("languages", {}, signal),
  );
  const publishersResource = useCachedResource(
    metadataCache,
    "publishers",
    "all",
    (signal) => listPublishers(signal),
  );
  const book = bookResource.data?.book ?? null;
  const files: BookFileInfo[] = bookResource.data?.files || [];
  const identifiers: BookIdentifier[] = bookResource.data?.identifiers || [];
  const options = useMemo<BookEditOptions | undefined>(() => {
    if (
      !authorsResource.data
      || !seriesResource.data
      || !tagsResource.data
      || !languagesResource.data
      || !publishersResource.data
    ) {
      return undefined;
    }
    return {
      authors: authorsResource.data.authors || [],
      series: seriesResource.data.series || [],
      tags: tagsResource.data.tags || [],
      languages: languagesResource.data.languages || [],
      publishers: publishersResource.data.publishers || [],
    };
  }, [authorsResource.data, seriesResource.data, tagsResource.data, languagesResource.data, publishersResource.data]);
  const loading = bookResource.loading
    || authorsResource.loading
    || seriesResource.loading
    || tagsResource.loading
    || languagesResource.loading
    || publishersResource.loading;

  const crumb = editOrigin
    ? { label: editOrigin.label, href: editOrigin.url }
    : book
      ? { label: book.title, href: `/book/${id}` }
      : undefined;

  if (loading) {
    return (
      <>
        <PageHeader title="Загрузка..." breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!book) {
    return (
      <>
        <PageHeader title="Книга не найдена" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Книга не найдена</div>
      </>
    );
  }
  const currentBook = book;

  const isbn = identifiers.find((i) => i.type === "isbn")?.value || null;
  // Detail/edit pages render the full-resolution cover (?full=1). Backend
  // wire coverPath is the list/card variant; override for display only.
  const bookData: BookDetail = {
    ...currentBook,
    coverPath: `/api/covers/${currentBook.id}?full=1&t=${currentBook.updatedAt}`,
  };
  const editFormats: BookFormat[] = files.map((f) => {
    const sz = f.fileSize ?? 0;
    return {
      format: f.format,
      size: sz > 1048576 ? `${(sz / 1048576).toFixed(1)} MB` : `${Math.round(sz / 1024)} KB`,
    };
  });

  async function handleSave(data: BookSavePayload) {
    const authorIds = data.authors.map((name: string) => {
      const found = options?.authors?.find((a) => a.name === name);
      return found ? found.id : name;
    });
    const tagIds = (data.tags || []).map((name: string) => {
      const found = options?.tags?.find((t) => t.name === name);
      return found ? found.id : name;
    });
    const seriesId = data.series
      ? options?.series?.find((s) => s.name === data.series)?.id || data.series
      : null;

    const body = {
      title: data.title,
      description: data.description,
      language: data.language,
      publisher: data.publisher,
      pubDate: data.pubDate,
      isbn: data.isbn,
      seriesId,
      seriesNumber: data.seriesNumber ? Number.parseFloat(data.seriesNumber) : null,
      authorIds,
      tagIds,
      addFormats: data.addFormats,
      deleteFormats: data.deleteFormats,
      commitCover: data.commitCover,
    };

    await updateBook(Number(id), body);
    navigate(`/book/${id}`, {
      replace: true,
      state: { origin: editOrigin?.bookOrigin ?? FALLBACK_BOOK_ORIGIN },
    });
  }

  return (
    <>
      <PageHeader title={`Редактирование: ${currentBook.title}`} breadcrumb={crumb} />
      <BookEditForm book={bookData} formats={editFormats} isbn={isbn} options={options} onSave={handleSave} editOrigin={editOrigin} />
    </>
  );
}
