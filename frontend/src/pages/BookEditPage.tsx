import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookEditForm from "../components/book-edit-form";
import { BookEditOptions, BookSavePayload } from "../components/book-edit-form.types";
import { colors } from "../theme";
import { Book, RawBook, toBook, splitCsv } from "../types";
import { getBook, updateBook } from "@/api/endpoints/books";
import { listFilterOptions, listPublishers } from "@/api/endpoints/filters";

export default function BookEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<RawBook | null>(null);
  const [files, setFiles] = useState<{ format: string; file_size: number }[]>([]);
  const [identifiers, setIdentifiers] = useState<{ type: string; value: string }[]>([]);
  const [options, setOptions] = useState<BookEditOptions>();
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <>
        <PageHeader title="Загрузка..." />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!book) {
    return (
      <>
        <PageHeader title="Книга не найдена" />
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

  async function handleSave(data: BookSavePayload) {
    // Resolve names to IDs
    const authorIds = splitCsv(data.authors)
      .map((name: string) => {
        const found = options?.authors?.find((a) => a.name === name);
        return found ? found.id : name; // send name if not found — backend will get_or_create
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
    };

    try {
      await updateBook(Number(id), body);
      // Invalidate catalog/pages caches so covers and data refresh
      sessionStorage.removeItem("librarium_catalog");
      sessionStorage.removeItem("librarium_authors");
      sessionStorage.removeItem("librarium_series");
      navigate(`/book/${id}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.warn("Failed to save book:", err);
    }
  }

  return (
    <>
      <PageHeader
        title={`Редактирование: ${book.title}`}
        breadcrumb={{ label: book.title, href: `/book/${id}` }}
      />
      <BookEditForm book={bookData} options={options} onSave={handleSave} />
    </>
  );
}
