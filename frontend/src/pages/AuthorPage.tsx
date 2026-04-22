import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { readOriginFromState } from "../components/breadcrumb-origin";
import AuthorDetail from "../components/author-detail";
import EntityAdminPanel from "../components/entity-admin-panel";
import { Book, toBook, splitCsv } from "../types";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { useAuth } from "../auth";
import { getAuthor } from "../api/endpoints/authors";
import type { Author } from "../api/endpoints/authors";
import { NotFoundError } from "@/api/errors";

// UI-local shape: tags split to string[], sort_name required (post-splitCsv transform).
interface AuthorData {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  tags: string[];
}

export default function AuthorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [author, setAuthor] = useState<AuthorData | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useScrollRestore(!loading);

  // Динамический родитель: если пришли с поиска (или другого места с origin) —
  // crumb ведёт туда; иначе fallback "Авторы" → "/authors".
  const stateOrigin = readOriginFromState(location.state);
  const crumb =
    stateOrigin && stateOrigin.type !== "book"
      ? { label: stateOrigin.label, href: stateOrigin.url }
      : { label: "Авторы", href: "/authors" };

  useEffect(() => {
    const numericId = Number(id);
    if (!id || isNaN(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    getAuthor(numericId, controller.signal)
      .then((data) => {
        const raw: Author = data.author;
        const authorData: AuthorData = {
          id: raw.id,
          name: raw.name,
          sort_name: raw.sort_name ?? "",
          book_count: data.books?.length || 0,
          tags: splitCsv(raw.tags),
        };
        setAuthor(authorData);
        setBooks((data.books || []).map((b) => toBook(b)));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (err instanceof NotFoundError) {
          setNotFound(true);
        } else {
          console.warn("Failed to fetch author:", err);
        }
        setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (notFound || !author) {
    return (
      <>
        <PageHeader title="Автор не найден" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Автор не найден</div>
      </>
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
    <>
      <PageHeader
        title={author.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        infoSlot={infoSlot}
        breadcrumb={crumb}
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
      <AuthorDetail
        author={{ id: author.id, name: author.name, bookCount: author.book_count, tags: author.tags }}
        books={books}
        bookLinkState={{
          origin: {
            type: "author",
            url: location.pathname + location.search,
            label: author.name,
            ...(stateOrigin && stateOrigin.type !== "book"
              ? { parentOrigin: stateOrigin }
              : {}),
          },
        }}
      />
    </>
  );
}
