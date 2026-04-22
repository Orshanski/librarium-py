import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { splitCsv } from "../types";
import { listAuthors } from "../api/endpoints/authors";
import type { Author } from "../api/endpoints/authors";
import { selectedToApiParams } from "../api/filter-params";
import { useScrollRestore } from "../hooks/useScrollRestore";

export default function AuthorsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  useScrollRestore(!loading);

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

  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);

  useEffect(() => {

    setLoading(true);
    const controller = new AbortController();
    const selected: SelectedFilters = {};
    if (tagIds.length) selected.tagIds = tagIds;
    if (language.length) selected.language = language;
    listAuthors(selectedToApiParams(selected), controller.signal)
      .then((data) => {
        setAuthors(data.authors || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to fetch authors list:", err);
        setAuthors([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [tagIds, language]);

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    navigate(`/authors?${params.toString()}`);
  }

  const selected: SelectedFilters = {};
  if (tagIds.length) selected.tagIds = tagIds;
  if (language.length) selected.language = language;

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  return (
    <>
      <PageHeader
        title="Авторы"
        filterKeys={["tagIds", "language"]}
        selected={selected}
        onSelectionChange={onSelectionChange}
        showUpload
      />

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {authors.map((author) => {
          const tagList = splitCsv(author.tags);
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
                  {pluralizeBooks(author.book_count)}
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
