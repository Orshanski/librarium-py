import { useMemo } from "react";
import { useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey } from "../components/smart-filter-bar";
import { clearedFilters, readSelectedFromSearchParams } from "../api/filter-types";
import { selectedToApiParams } from "../api/filter-params";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { listSeries } from "../api/endpoints/series";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { entityListScrollContext } from "@/scroll/contexts";
import { metadataCache, useCachedResource } from "@/cache";

export default function SeriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const scrollContext = useMemo(
    () => entityListScrollContext(location.pathname + location.search, "series"),
    [location.pathname, location.search],
  );

  const seriesLinkState = useMemo(
    () => ({
      origin: {
        type: "series_list" as const,
        url: location.pathname + location.search,
        label: "Серии",
      },
    }),
    [location.pathname, location.search],
  );

  const selected = readSelectedFromSearchParams(searchParams);

  const seriesResource = useCachedResource(
    metadataCache,
    "series",
    location.pathname + location.search,
    (signal) => listSeries(selectedToApiParams(selected), signal),
  );
  const allSeries = seriesResource.data?.series ?? [];
  const loading = seriesResource.loading;
  useScrollRestore(!loading, scrollContext);

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    const qs = params.toString();
    navigate(qs ? `/series?${qs}` : "/series");
  }

  function onSelectionChange(key: FilterKey, values: string[]) {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }

  // Свой обработчик сброса вместо запасного пути панели: тот снимал фильтры по одному,
  // и переходы затирали друг друга (снимок searchParams внутри нажатия не обновляется).
  function clearAllFilters() {
    updateParams(clearedFilters());
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
        onClearAll={clearAllFilters}
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
            state={seriesLinkState}
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
                {s.authors && s.authors.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.textDim }}>
                    {s.authors.map((a) => a.name).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, color: colors.textDim, whiteSpace: "nowrap", marginLeft: 16 }}>
                {pluralizeBooks(s.bookCount)}
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
