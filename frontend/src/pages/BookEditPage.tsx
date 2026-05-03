import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookEditForm from "../components/book-edit-form";
import { BookEditOptions, BookSavePayload } from "../components/book-edit-form.types";
import type { BookContextOrigin, ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import { Book, RawBook, toBook } from "../types";
import { getBook, updateBook, type BookFileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { listFilterOptions, listPublishers } from "@/api/endpoints/filters";
import { deriveBookChangedFields } from "@/domain/book-changes";
import { domainEvents } from "@/domain/events";
import type { BookChangedField } from "@/domain/events";

const FALLBACK_BOOK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

function arraysEqual(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function changedBookEditBody(body: Record<string, unknown>, original: RawBook, originalIsbn: string | null): Record<string, unknown> {
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

export default function BookEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [book, setBook] = useState<RawBook | null>(null);
  const [files, setFiles] = useState<BookFileInfo[]>([]);
  const [identifiers, setIdentifiers] = useState<BookIdentifier[]>([]);
  const [options, setOptions] = useState<BookEditOptions>();
  const [loading, setLoading] = useState(true);

  const stateOrigin = readOriginFromState(location.state);
  const editOrigin: BookContextOrigin | undefined =
    stateOrigin?.type === "book" ? stateOrigin : undefined;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    Promise.all([
      getBook(Number(id), controller.signal),
      listFilterOptions("authors", {}, controller.signal),
      listFilterOptions("series", {}, controller.signal),
      listFilterOptions("tags", {}, controller.signal),
      listFilterOptions("languages", {}, controller.signal),
      listPublishers(controller.signal),
    ])
      .then(([bookData, authorsData, seriesData, tagsData, langsData, pubsData]) => {
        setBook(bookData.book);
        setFiles(bookData.files || []);
        setIdentifiers(bookData.identifiers || []);
        setOptions({
          authors: authorsData.authors || [],
          series: seriesData.series || [],
          tags: tagsData.tags || [],
          languages: langsData.languages || [],
          publishers: pubsData.publishers || [],
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load book edit data:", err);
        setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

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
  const bookData: Book = {
    ...toBook(currentBook, { fullCover: true, isbn }),
    formats: files.map((f) => {
      const sz = f.fileSize ?? 0;
      return {
        format: f.format,
        size: sz > 1048576 ? `${(sz / 1048576).toFixed(1)} MB` : `${Math.round(sz / 1024)} KB`,
      };
    }),
  };

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
      seriesNumber: data.seriesNumber ? parseFloat(data.seriesNumber) : null,
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
      affected: hasMembershipChange(changedFields) ? undefined : {
        authorIds: currentBook.authors.map((author) => author.id),
        seriesId: currentBook.series?.id ?? null,
        tagIds: currentBook.tags.map((tag) => tag.id),
        language: currentBook.language,
      },
    });
    navigate(`/book/${id}`, {
      replace: true,
      state: { origin: editOrigin?.bookOrigin ?? FALLBACK_BOOK_ORIGIN },
    });
  }

  return (
    <>
      <PageHeader title={`Редактирование: ${currentBook.title}`} breadcrumb={crumb} />
      <BookEditForm book={bookData} options={options} onSave={handleSave} editOrigin={editOrigin} />
    </>
  );
}
