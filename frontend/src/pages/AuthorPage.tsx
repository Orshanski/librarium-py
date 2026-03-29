import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import AuthorDetail from "../components/author-detail";
import EntityAdminPanel from "../components/entity-admin-panel";
import { Book } from "../types";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { useAuth } from "../auth";

interface AuthorData {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  tags: string[];
}

interface BookRow {
  id: number;
  title: string;
  authors: string | null;
  series_name: string | null;
  series_number: number | null;
  tags: string | null;
  rating: number | null;
  language: string | null;
  cover_path: string | null;
  description: string | null;
  publisher: string | null;
  pub_date: string | null;
  updated_at?: string;
}

function mapBook(b: BookRow): Book {
  return {
    id: b.id,
    title: b.title,
    authors: b.authors ? b.authors.split(",").map((a) => a.trim()) : [],
    series: b.series_name,
    seriesNumber: b.series_number,
    tags: b.tags ? b.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    rating: b.rating,
    language: b.language || "",
    coverPath: `/api/covers/${b.id}?t=${b.updated_at || ""}`,
    description: b.description,
    publisher: b.publisher,
    pubDate: b.pub_date,
    formats: [],
    isbn: null,
  };
}

export default function AuthorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [author, setAuthor] = useState<AuthorData | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    fetch(`/api/authors/${id}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const a = data.author;
        a.tags = a.tags ? a.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        a.book_count = data.books?.length || 0;
        setAuthor(a);
        setBooks((data.books || []).map(mapBook));
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (author) saveBookOrigin(author.name, `/authors/${author.id}`);
  }, [author]);

  if (loading) {
    return (
      <Shell>
        <PageHeader title="..." breadcrumb={{ label: "Авторы", href: getBreadcrumbUrl("authors", "/authors") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </Shell>
    );
  }

  if (notFound || !author) {
    return (
      <Shell>
        <PageHeader title="Автор не найден" breadcrumb={{ label: "Авторы", href: getBreadcrumbUrl("authors", "/authors") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Автор не найден</div>
      </Shell>
    );
  }

  const infoSlot = (
    <div style={{ display: "flex", gap: 16, fontSize: 13, color: colors.textDim }}>
      <span>
        {pluralizeBooks(author.book_count)}
      </span>
      <span>{author.tags.slice(0, 5).join(", ")}</span>
    </div>
  );

  const adminButton = user?.role === "admin" ? (
    <button
      onClick={() => setShowAdmin(!showAdmin)}
      style={{
        marginLeft: 12,
        padding: 0,
        background: "transparent",
        border: "none",
        color: colors.accent,
        fontSize: 22,
        cursor: "pointer",
        opacity: 1,
        lineHeight: 1,
      }}
      aria-label="Управление автором"
    >⚙</button>
  ) : undefined;

  return (
    <Shell>
      <PageHeader
        title={author.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        infoSlot={infoSlot}
        breadcrumb={{ label: "Авторы", href: getBreadcrumbUrl("authors", "/authors") }}
      />
      {showAdmin && author && (
        <EntityAdminPanel
          entityType="author"
          entityId={author.id}
          currentName={author.name}
          bookCount={author.book_count}
          onRenamed={(newName) => { setAuthor({...author, name: newName}); setShowAdmin(false); }}
          onMerged={() => window.location.reload()}
          onDeleted={() => navigate("/authors")}
        />
      )}
      <AuthorDetail author={{ id: author.id, name: author.name, bookCount: author.book_count, tags: author.tags }} books={books} />
    </Shell>
  );
}
