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

function saveCache(allSeries: Series[], selected: SelectedFilters) {
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

  // Read cache once synchronously — initial state + scroll-restore RAF.
  const initialCacheRef = useRef(loadCache());

  const [selected, setSelected] = useState<SelectedFilters>(initialCacheRef.current?.selected || {});
  const [allSeries, setAllSeries] = useState<Series[]>(initialCacheRef.current?.allSeries || []);
  const [loading, setLoading] = useState(!initialCacheRef.current);
  const frozenRef = useRef(!!initialCacheRef.current);
  const restoredRef = useRef(!!initialCacheRef.current);

  const authorIds = selected.authorIds || [];
  const tagIds = selected.tagIds || [];
  const languages = selected.language || [];
  const paramsKey = `${authorIds.join(",")}|${tagIds.join(",")}|${languages.join(",")}`;

  // Scroll + breadcrumb restore on mount
  useEffect(() => {
    saveBreadcrumbUrl("series", window.location.pathname + window.location.search);
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/series", { replace: true });
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
    listSeries(apiParams, controller.signal)
      .then((data) => {
        setAllSeries(data.series || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to fetch series list:", err);
        setAllSeries([]);
        setLoading(false);
      });

    return () => controller.abort();
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
        filterKeys={["authorIds", "tagIds", "language"]}
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
