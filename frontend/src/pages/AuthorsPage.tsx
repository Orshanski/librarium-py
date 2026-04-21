import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { pluralizeBooks } from "../utils/pluralize";
import { saveBreadcrumbUrl } from "../utils/breadcrumb-state";
import { colors } from "../theme";
import { splitCsv } from "../types";
import { listAuthors } from "../api/endpoints/authors";
import type { Author } from "../api/endpoints/authors";
import { selectedToApiParams } from "../api/filter-params";

const CACHE_KEY = "librarium_authors_v2";

function saveCache(authors: Author[], selected: SelectedFilters) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      authors,
      selected,
      scrollTop: main?.scrollTop || 0,
    }));
  } catch {}
}

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.authors?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default function AuthorsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read cache once synchronously — used for initial state AND for scroll restore RAF.
  // Must stay out of useMemo: no deps, executed on mount only.
  const initialCacheRef = useRef(loadCache());

  const [selected, setSelected] = useState<SelectedFilters>(initialCacheRef.current?.selected || {});
  const [authors, setAuthors] = useState<Author[]>(initialCacheRef.current?.authors || []);
  const [loading, setLoading] = useState(!initialCacheRef.current);
  const frozenRef = useRef(!!initialCacheRef.current);
  const restoredRef = useRef(!!initialCacheRef.current);

  const tagIds = selected.tagIds || [];
  const languages = selected.language || [];
  const paramsKey = `${tagIds.join(",")}|${languages.join(",")}`;

  // Restore scroll + breadcrumb on mount
  useEffect(() => {
    saveBreadcrumbUrl("authors", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/authors", { replace: true });
      return;
    }
    const cached = initialCacheRef.current;
    if (cached) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = cached.scrollTop;
          setTimeout(() => { frozenRef.current = false; }, 200);
        });
      });
    }
  }, []); // mount only

  // Fetch on filter change
  useEffect(() => {
    if (restoredRef.current) {
      restoredRef.current = false;
      return () => {}; // skip first run after restore — no cleanup needed
    }

    setLoading(true);
    sessionStorage.removeItem(CACHE_KEY);

    const controller = new AbortController();
    const apiParams = selectedToApiParams(selected);

    listAuthors(apiParams, controller.signal)
      .then((data) => {
        setAuthors(data.authors || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to fetch authors list:", err);
        setAuthors([]);
        setLoading(false);
      });

    return () => controller.abort();
  }, [paramsKey]);

  // Save cache on data/filter change and on unmount
  const stateRef = useRef({ authors, selected });
  stateRef.current = { authors, selected };

  useEffect(() => {
    if (authors.length > 0) saveCache(authors, selected);
  }, [authors, selected, paramsKey]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function onScroll() {
      const s = stateRef.current;
      saveCache(s.authors, s.selected);
    }
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      const s = stateRef.current;
      if (s.authors.length > 0) saveCache(s.authors, s.selected);
    };
  }, []);

  function onSelectionChange(key: FilterKey, values: string[]) {
    sessionStorage.removeItem(CACHE_KEY);
    setSelected((prev) => ({ ...prev, [key]: values }));
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
