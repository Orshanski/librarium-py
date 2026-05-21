import { useState } from "react";

import PageHeader from "../components/page-header";
import AuthorDetail from "../components/author-detail";
import EntityAdminPanel from "../components/entity-admin-panel";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import { useAuthorPage } from "../hooks/useAuthorPage";

export default function AuthorPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const {
    author,
    books,
    loading,
    notFound,
    crumb,
    pathnameWithSearch,
    parentOriginForBookLink,
    navigateAfterDelete,
  } = useAuthorPage();

  const [showAdmin, setShowAdmin] = useState(false);

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
      <span>{pluralizeBooks(author.bookCount)}</span>
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
      {!isMobile && showAdmin && (
        <EntityAdminPanel
          entityType="author"
          entityId={author.id}
          currentName={author.name}
          bookCount={author.bookCount}
          onRenamed={() => setShowAdmin(false)}
          onMerged={() => setShowAdmin(false)}
          onDeleted={() => {
            setShowAdmin(false);
            // Страховка поверх подписки хука на authorDeleted: основная навигация — через подписку,
            // эта строка защищает от изменений порядка publish/callback в EntityAdminPanel.
            navigateAfterDelete();
          }}
        />
      )}
      <AuthorDetail
        author={{ id: author.id, name: author.name, bookCount: author.bookCount, tags: author.tags }}
        books={books}
        bookLinkState={{
          origin: {
            type: "author",
            url: pathnameWithSearch,
            label: author.name,
            ...(parentOriginForBookLink ? { parentOrigin: parentOriginForBookLink } : {}),
          },
        }}
      />
    </>
  );
}
