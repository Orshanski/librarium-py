import { useMemo, useState } from "react";
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
import { deriveBookChangedFields } from "@/domain/book-changes";
import { domainEvents } from "@/domain/events";
import type { BookChangedField } from "@/domain/events";
import { metadataCache, useCachedResource } from "@/cache";
import { NotFoundError } from "@/api/errors";

const FALLBACK_BOOK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

function arraysEqual(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function changedBookEditBody(body: Record<string, unknown>, original: BookDetail, originalIsbn: string | null): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  if (body.title !== original.title) changed.title = body.title;
  if ((body.description || "") !== (original.description || "")) changed.description = body.description;
  if ((body.language || "") !== (original.language || "")) changed.language = body.language;
  if ((body.publisher || null) !== (original.publisher || null)) changed.publisher = body.publisher;
  if ((body.pubDate || null) !== (original.pubDate || null)) changed.pubDate = body.pubDate;
  if ((body.isbn || null) !== (originalIsbn || null)) changed.isbn = body.isbn;
  if (!arraysEqual(body.authorIds as unknown[], original.authors.map((author) => author.id))) {
    changed.authorIds = body.authorIds;
  }
  if ((body.seriesId ?? null) !== (original.series?.id ?? null)) changed.seriesId = body.seriesId;
  if ((body.seriesNumber ?? null) !== (original.seriesNumber ?? null)) changed.seriesNumber = body.seriesNumber;
  if (!arraysEqual(body.tagIds as unknown[], original.tags.map((tag) => tag.id))) {
    changed.tagIds = body.tagIds;
  }
  if (Array.isArray(body.addFormats) && body.addFormats.length > 0) changed.addFormats = body.addFormats;
  if (Array.isArray(body.deleteFormats) && body.deleteFormats.length > 0) changed.deleteFormats = body.deleteFormats;
  if (body.commitCover === true) changed.commitCover = true;
  return changed;
}

function hasMembershipChange(changedFields: BookChangedField[]): boolean {
  return changedFields.some((field) => field === "authors" || field === "series" || field === "tags" || field === "language");
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === "number"))];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function buildBookUpdateAffected(
  changedFields: BookChangedField[],
  previous: BookDetail,
  next: BookDetail,
): NonNullable<Parameters<typeof domainEvents.publish<"bookUpdated">>[1]["affected"]> | undefined {
  if (!hasMembershipChange(changedFields)) return undefined;
  const affected: NonNullable<Parameters<typeof domainEvents.publish<"bookUpdated">>[1]["affected"]> = {};
  if (changedFields.includes("authors")) {
    affected.authorIds = uniqueNumbers([
      ...previous.authors.map((author) => author.id),
      ...next.authors.map((author) => author.id),
    ]);
  }
  if (changedFields.includes("series")) {
    affected.seriesIds = uniqueNumbers([previous.series?.id, next.series?.id]);
  }
  if (changedFields.includes("tags")) {
    affected.tagIds = uniqueNumbers([
      ...previous.tags.map((tag) => tag.id),
      ...next.tags.map((tag) => tag.id),
    ]);
  }
  if (changedFields.includes("language")) {
    affected.languages = uniqueStrings([previous.language, next.language]);
  }
  return affected;
}

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

    const updated = await updateBook(Number(id), body);
    const changedFields = deriveBookChangedFields(changedBookEditBody(body, currentBook, isbn));
    domainEvents.publish("bookUpdated", {
      book: updated.book,
      detail: updated,
      changedFields,
      affected: buildBookUpdateAffected(changedFields, currentBook, updated.book),
    });
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
