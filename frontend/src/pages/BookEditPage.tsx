import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import BookEditForm from "../components/book-edit-form";
import { colors } from "../theme";

export default function BookEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [identifiers, setIdentifiers] = useState<any[]>([]);
  const [options, setOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/books/${id}`).then((r) => r.json()),
      fetch("/api/options").then((r) => r.json()),
    ]).then(([bookData, optionsData]) => {
      setBook(bookData.book);
      setFiles(bookData.files || []);
      setIdentifiers(bookData.identifiers || []);
      setOptions(optionsData);
      setLoading(false);
    }).catch(() => setLoading(false));
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

  async function handleSave(data: any) {
    // Resolve names to IDs
    const authorIds = (data.authors || "").split(",").map((a: string) => a.trim()).filter(Boolean)
      .map((name: string) => {
        const found = options?.authors?.find((a: any) => a.name === name);
        return found ? found.id : name; // send name if not found — backend will get_or_create
      });
    const tagIds = (data.tags || []).map((name: string) => {
      const found = options?.tags?.find((t: any) => t.name === name);
      return found ? found.id : name;
    });
    const seriesId = data.series
      ? options?.series?.find((s: any) => s.name === data.series)?.id || data.series
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

    const res = await fetch(`/api/books/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      // Invalidate catalog/pages caches so covers and data refresh
      sessionStorage.removeItem("librarium_catalog");
      sessionStorage.removeItem("librarium_authors");
      sessionStorage.removeItem("librarium_series");
      navigate(`/book/${id}`);
    }
  }

  return (
    <Shell>
      <PageHeader
        title={`Редактирование: ${book.title}`}
        breadcrumb={{ label: book.title, href: `/book/${id}` }}
      />
      <BookEditForm book={bookData} options={options} onSave={handleSave} />
    </Shell>
  );
}
