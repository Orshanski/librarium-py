import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookEditForm from "../components/book-edit-form";
import { BookEditOptions, BookSavePayload } from "../components/book-edit-form.types";
import type { BookContextOrigin, ListOrigin } from "../components/breadcrumb-origin";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors } from "../theme";
import { Book, RawBook, toBook, splitCsv } from "../types";
import { getBook, updateBook, type BookFileInfo, type BookIdentifier } from "@/api/endpoints/books";
import { listFilterOptions, listPublishers } from "@/api/endpoints/filters";

const FALLBACK_BOOK_ORIGIN: ListOrigin = { type: "catalog", url: "/", label: "Каталог" };

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

  const isbn = identifiers.find((i) => i.type === "isbn")?.value || null;
  const bookData: Book = {
    ...toBook(book, { fullCover: true, isbn }),
    formats: files.map((f) => ({
      format: f.format,
      size: (f.fileSize ?? 0) > 1048576
        ? `${((f.fileSize ?? 0) / 1048576).toFixed(1)} MB`
        : `${Math.round((f.fileSize ?? 0) / 1024)} KB`,
    })),
  };

  async function handleSave(data: BookSavePayload) {
    const authorIds = splitCsv(data.authors)
      .map((name: string) => {
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
      seriesId,
      seriesNumber: data.seriesNumber ? parseFloat(data.seriesNumber) : null,
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
      <PageHeader title={`Редактирование: ${book.title}`} breadcrumb={crumb} />
      <BookEditForm book={bookData} options={options} onSave={handleSave} editOrigin={editOrigin} />
    </>
  );
}
