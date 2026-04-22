import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import { FilterKey, readSelectedFromSearchParams } from "../components/smart-filter-bar";
import { selectedToApiParams } from "../api/filter-params";
import { pluralizeBooks } from "../utils/pluralize";
import { colors } from "../theme";
import { listSeries } from "../api/endpoints/series";
import type { Series } from "../api/endpoints/series";
import { useScrollRestore } from "../hooks/useScrollRestore";

export default function SeriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useScrollRestore(!loading);

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

  const authorIds = useMemo(() => searchParams.getAll("authorIds"), [searchParams]);
  const tagIds = useMemo(() => searchParams.getAll("tagIds"), [searchParams]);
  const language = useMemo(() => searchParams.getAll("language"), [searchParams]);

  const selected = readSelectedFromSearchParams(searchParams);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    listSeries(selectedToApiParams(selected), controller.signal)
      .then((data) => {
        setAllSeries(data.series || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to fetch series list:", err);
        setAllSeries([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [authorIds, tagIds, language]);

  function updateParams(updates: Record<string, string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const v of values) params.append(key, v);
      }
    }
    navigate(`/series?${params.toString()}`);
  }

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
