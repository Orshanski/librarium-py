import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey } from "../components/smart-filter-bar";
import { pluralizeBooks } from "../utils/pluralize";
import { saveBreadcrumbUrl } from "../utils/breadcrumb-state";
import { colors } from "../theme";
import { listSeries } from "../api/endpoints/series";
import type { Series } from "../api/endpoints/series";

const CACHE_KEY = "librarium_series";

// Re-export the canonical Series type for use within this module
type SeriesItem = Series;

function saveCache(allSeries: SeriesItem[], selected: Record<string, string[]>) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      allSeries,
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
    if (!data.allSeries?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default function SeriesListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [allSeries, setAllSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const frozenRef = useRef(false);

  const authorFilter = selected.author || [];
  const tagFilter = selected.genre || [];
  const langFilter = selected.language || [];
  const paramsKey = `${authorFilter.join(",")}|${tagFilter.join(",")}|${langFilter.join(",")}`;

  // Restore from cache on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    saveBreadcrumbUrl("series", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/series", { replace: true });
      return;
    }
    const cached = loadCache();
    if (cached) {
      setAllSeries(cached.allSeries);
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
      return;
    }

    setLoading(true);
    sessionStorage.removeItem(CACHE_KEY);

    const params: { authorIds?: string; tagIds?: string; language?: string } = {};
    if (authorFilter.length > 0) params.authorIds = authorFilter.join(",");
    if (tagFilter.length > 0) params.tagIds = tagFilter.join(",");
    if (langFilter.length > 0) params.language = langFilter[0];

    listSeries(params)
      .then((data) => {
        setAllSeries(data.series || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [paramsKey]);

  // Save cache on data/filter change and on unmount
  const stateRef = useRef({ allSeries, selected });
  stateRef.current = { allSeries, selected };

  useEffect(() => {
    if (allSeries.length > 0) saveCache(allSeries, selected);
  }, [allSeries, selected, paramsKey]);

  // Scroll listener: save cache on scroll
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      const s = stateRef.current;
      saveCache(s.allSeries, s.selected);
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      const s = stateRef.current;
      if (s.allSeries.length > 0) saveCache(s.allSeries, s.selected);
    };
  }, []);

  const sorted = useMemo(() => {
    return [...allSeries].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [allSeries]);

  return (
    <>
      <PageHeader
        title="Серии"
        filterKeys={["author", "genre", "language"]}
        selected={selected}
        onSelectionChange={(key: FilterKey, values: string[]) => {
          sessionStorage.removeItem(CACHE_KEY);
          setSelected((prev) => ({ ...prev, [key]: values }));
        }}
        showUpload
      />

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sorted.map((s) => (
          <Link
            key={s.id}
            to={`/series/${s.id}`}
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
                  {s.name}
                </div>
                <div style={{ fontSize: 12, color: colors.textDim }}>
                  {s.authors}
                </div>
              </div>
              <div style={{ fontSize: 13, color: colors.textDim, whiteSpace: "nowrap", marginLeft: 16 }}>
                {pluralizeBooks(s.book_count)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Ничего не найдено</div>
      )}
    </>
  );
}
