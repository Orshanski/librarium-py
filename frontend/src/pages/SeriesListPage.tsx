import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { selectedToApiParams } from "../api/filter-params";
import { pluralizeBooks } from "../utils/pluralize";
import { saveBreadcrumbUrl } from "../utils/breadcrumb-state";
import { colors } from "../theme";
import { listSeries } from "../api/endpoints/series";
import type { Series } from "../api/endpoints/series";

const CACHE_KEY = "librarium_series_v2";

function saveCache(allSeries: Series[], paramsKey: string) {
  if (allSeries.length === 0) return;
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      allSeries,
      paramsKey,
      scrollTop: main?.scrollTop || 0,
    }));
  } catch {}
}

function loadCache(paramsKey: string) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.paramsKey !== paramsKey) return null;
    if (!data.allSeries?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default function SeriesListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const frozenRef = useRef(false);

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);
  const paramsKey = `${authorIds.join(",")}|${tagIds.join(",")}|${language.join(",")}`;

  // Load: restore from cache or fetch fresh
  useEffect(() => {
    saveBreadcrumbUrl("series", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/series", { replace: true });
      return;
    }
    const cached = loadCache(paramsKey);
    if (cached) {
      setAllSeries(cached.allSeries);
      setLoading(false);
      frozenRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = cached.scrollTop;
          setTimeout(() => { frozenRef.current = false; }, 200);
        });
      });
      return;
    }

    setLoading(true);
    sessionStorage.removeItem(CACHE_KEY);
    const controller = new AbortController();
    const selected: SelectedFilters = {};
    if (authorIds.length) selected.authorIds = authorIds;
    if (tagIds.length) selected.tagIds = tagIds;
    if (language.length) selected.language = language;
    listSeries(selectedToApiParams(selected), controller.signal)
      .then((data) => {
        setAllSeries(data.series || []);
        setLoading(false);
        frozenRef.current = false;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to fetch series list:", err);
        setAllSeries([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [paramsKey, authorIds, tagIds, language]);

  // Scroll listener: save cache
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      saveCache(allSeries, paramsKey);
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
    };
  }, [allSeries, paramsKey]);

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    sessionStorage.removeItem(CACHE_KEY);
    navigate(`/series?${params.toString()}`);
  }

  const selected: SelectedFilters = {};
  if (authorIds.length) selected.authorIds = authorIds;
  if (tagIds.length) selected.tagIds = tagIds;
  if (language.length) selected.language = language;

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  const sorted = useMemo(() => {
    return [...allSeries].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [allSeries]);

  return (
    <>
      <PageHeader
        title="Серии"
        filterKeys={["authorIds", "tagIds", "language"]}
        selected={selected}
        onSelectionChange={onSelectionChange}
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
