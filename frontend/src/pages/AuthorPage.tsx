import { useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { readOriginFromState } from "../components/breadcrumb-origin";
import AuthorDetail from "../components/author-detail";
import EntityAdminPanel from "../components/entity-admin-panel";
import type { Book } from "../types";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import { getAuthor } from "../api/endpoints/authors";
import type { Author } from "../api/endpoints/authors";
import { NotFoundError } from "@/api/errors";
import { authorScrollContext } from "@/scroll/contexts";
import { metadataCache, useCachedResource } from "@/cache";

// UI-local shape: tags split to string[], sortName required (post-map transform).
interface AuthorData {
  id: number;
  name: string;
  sortName: string;
  bookCount: number;
  tags: string[];
}

export default function AuthorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [showAdmin, setShowAdmin] = useState(false);

  const authorId = Number(id);
  const scrollContext = useMemo(
    () => authorScrollContext(location.pathname + location.search, authorId),
    [location.pathname, location.search, authorId],
  );

  // Динамический родитель: если пришли с поиска (или другого места с origin) —
  // crumb ведёт туда; иначе fallback "Авторы" → "/authors".
  const stateOrigin = readOriginFromState(location.state);
  const crumb =
    stateOrigin && stateOrigin.type !== "book"
      ? { label: stateOrigin.label, href: stateOrigin.url }
      : { label: "Авторы", href: "/authors" };

  const authorResource = useCachedResource(
    metadataCache,
    `author/${authorId}`,
    "detail",
    (signal) => (
      !id || Number.isNaN(authorId)
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getAuthor(authorId, signal)
    ),
    { context: scrollContext },
  );
  const author = useMemo<AuthorData | null>(() => {
    const raw: Author | undefined = authorResource.data?.author;
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name,
      sortName: raw.sortName ?? "",
      bookCount: authorResource.data?.books?.length || 0,
      tags: raw.tags?.map((t) => t.name) ?? [],
    };
  }, [authorResource.data]);
  const books = useMemo<Book[]>(
    () => authorResource.data?.books || [],
    [authorResource.data],
  );
  const loading = authorResource.loading;
  const notFound = authorResource.error instanceof NotFoundError || !id || Number.isNaN(authorId);
  useScrollRestore(!loading, scrollContext);

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
        {pluralizeBooks(author.bookCount)}
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
        infoSlot={infoSlot}
        breadcrumb={crumb}
      />
      {!isMobile && showAdmin && author && (
        <EntityAdminPanel
          entityType="author"
          entityId={author.id}
          currentName={author.name}
          bookCount={author.bookCount}
          onRenamed={(newName) => {
            if (authorResource.data) {
              metadataCache.set(`author/${author.id}`, "detail", {
                ...authorResource.data,
                author: { ...authorResource.data.author, name: newName },
              }, { context: scrollContext });
            }
            setShowAdmin(false);
          }}
          onMerged={() => globalThis.location.reload()}
          onDeleted={() => navigate("/authors")}
        />
      )}
      <AuthorDetail
        author={{ id: author.id, name: author.name, bookCount: author.bookCount, tags: author.tags }}
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
