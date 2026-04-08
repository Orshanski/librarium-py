import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { pluralizeBooks } from "../utils/pluralize";
import { saveBreadcrumbUrl } from "../utils/breadcrumb-state";
import { colors } from "../theme";
import { splitCsv } from "../types";

const CACHE_KEY = "librarium_authors";

interface AuthorRow {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  tags: string | null;
}

function saveCache(authors: AuthorRow[], selected: Record<string, string[]>) {
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
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const frozenRef = useRef(false);

  const genreFilter = selected.genre || [];
  const langFilter = selected.language || [];
  const paramsKey = `${genreFilter.join(",")}|${langFilter.join(",")}`;

  // Restore from cache on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    saveBreadcrumbUrl("authors", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/authors", { replace: true });
      return;
    }
    const cached = loadCache();
    if (cached) {
      setAuthors(cached.authors);
      if (cached.selected) setSelected(cached.selected);
      setLoading(false);
      restoredRef.current = true;
      frozenRef.current = true;
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
      return; // skip first run after restore
    }

    setLoading(true);
    sessionStorage.removeItem(CACHE_KEY);

    const params = new URLSearchParams();
    if (genreFilter.length > 0) params.set("tagIds", genreFilter.join(","));
    if (langFilter.length > 0) params.set("language", langFilter[0]);

    fetch(`/api/authors?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAuthors(data.authors || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [paramsKey]);

  // Save cache on data/filter change and on unmount
  const stateRef = useRef({ authors, selected });
  stateRef.current = { authors, selected };

  useEffect(() => {
    if (authors.length > 0) saveCache(authors, selected);
  }, [authors, paramsKey]);

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
        filterKeys={["genre", "language"]}
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
