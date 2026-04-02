import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterConfig } from "../components/filter-bar";
import { pluralizeBooks } from "../utils/pluralize";
import { saveBreadcrumbUrl } from "../utils/breadcrumb-state";
import { colors } from "../theme";

const CACHE_KEY = "librarium_series";

interface SeriesItem {
  id: number;
  name: string;
  sort_name: string;
  book_count: number;
  authors: string | null;
}

function saveCache(allSeries: SeriesItem[], options: any, selected: Record<string, string[]>) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      allSeries,
      options,
      selected,
      scrollTop: main?.scrollTop || 0,
    }));
    saveBreadcrumbUrl("series", window.location.pathname + window.location.search);
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
  const [options, setOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const frozenRef = useRef(false);

  const authorFilter = selected.author || [];
  const tagFilter = selected.genre || [];
  const langFilter = selected.language || [];
  const paramsKey = `${authorFilter.join(",")}|${tagFilter.join(",")}|${langFilter.join(",")}`;

  // Restore from cache on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    const fresh = searchParams.get("fresh");
    if (fresh) {
      sessionStorage.removeItem(CACHE_KEY);
      navigate("/series", { replace: true });
      return;
    }
    const cached = loadCache();
    if (cached) {
      setAllSeries(cached.allSeries);
      setOptions(cached.options);
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

    const params = new URLSearchParams();
    if (authorFilter.length > 0) params.set("authorIds", authorFilter.join(","));
    if (tagFilter.length > 0) params.set("tagIds", tagFilter.join(","));
    if (langFilter.length > 0) params.set("language", langFilter[0]);

    Promise.all([
      fetch(`/api/series?${params.toString()}`).then((r) => r.json()),
      options ? Promise.resolve(options) : fetch("/api/options").then((r) => r.json()),
    ])
      .then(([seriesData, optionsData]) => {
        setAllSeries(seriesData.series || []);
        setOptions(optionsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [paramsKey]);

  // Save cache on data/filter change and on unmount
  const stateRef = useRef({ allSeries, options, selected });
  stateRef.current = { allSeries, options, selected };

  useEffect(() => {
    if (allSeries.length > 0) saveCache(allSeries, options, selected);
  }, [allSeries, options, paramsKey]);

  // Scroll listener: save cache on scroll
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      const s = stateRef.current;
      saveCache(s.allSeries, s.options, s.selected);
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      const s = stateRef.current;
      if (s.allSeries.length > 0) saveCache(s.allSeries, s.options, s.selected);
    };
  }, []);

  const filterConfigs: FilterConfig[] = options
    ? [
        {
          key: "author",
          label: "Автор",
          options: (options.authors || []).map((a: any) => ({
            value: String(a.id),
            label: a.name,
          })),
        },
        {
          key: "genre",
          label: "Жанр",
          options: (options.tags || []).map((t: any) => ({
            value: String(t.id),
            label: t.name,
            count: t.book_count,
          })),
        },
        {
          key: "language",
          label: "Язык",
          options: (options.languages || []).map((l: string) => ({
            value: l,
          })),
        },
      ]
    : [];

  const sorted = useMemo(() => {
    return [...allSeries].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [allSeries]);

  return (
    <>
      <PageHeader
        title="Серии"
        filters={filterConfigs}
        selected={selected}
        onSelectionChange={(key, values) => {
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
