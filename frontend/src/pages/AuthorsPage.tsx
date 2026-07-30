import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { useFilterParams } from "../hooks/useFilterParams";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { listAuthors } from "../api/endpoints/authors";
import { selectedToApiParams } from "../api/filter-params";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { entityListScrollContext } from "@/scroll/contexts";
import { metadataCache, useCachedResource } from "@/cache";

export default function AuthorsPage() {
  const location = useLocation();
  const { selected, onSelectionChange, clearAllFilters } = useFilterParams("/authors");

  const scrollContext = useMemo(
    () => entityListScrollContext(location.pathname + location.search, "authors"),
    [location.pathname, location.search],
  );

  const authorLinkState = useMemo(
    () => ({
      origin: {
        type: "authors_list" as const,
        url: location.pathname + location.search,
        label: "Авторы",
      },
    }),
    [location.pathname, location.search],
  );

  const authorsResource = useCachedResource(
    metadataCache,
    "authors",
    location.pathname + location.search,
    (signal) => listAuthors(selectedToApiParams(selected), signal),
  );
  const authors = authorsResource.data?.authors ?? [];
  const loading = authorsResource.loading;
  useScrollRestore(!loading, scrollContext);

  return (
    <>
      <PageHeader
        title="Авторы"
        filterKeys={["tagIds", "language"]}
        selected={selected}
        onSelectionChange={onSelectionChange}
        onClearAll={clearAllFilters}
        showUpload
      />

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {authors.map((author) => {
          const tagList = author.tags?.map((t) => t.name) ?? [];
          return (
            <Link
              key={author.id}
              to={`/authors/${author.id}`}
              state={authorLinkState}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: 6,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 15, color: colors.text, marginBottom: 2 }}>
                    {author.name}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textDim, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tagList.slice(0, 4).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: colors.textDim, whiteSpace: "nowrap", marginLeft: 16 }}>
                  {pluralizeBooks(author.bookCount)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {!loading && authors.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Авторы не найдены</div>
      )}
    </>
  );
}
