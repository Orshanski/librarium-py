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
    const res = await fetch(`/api/books/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
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
