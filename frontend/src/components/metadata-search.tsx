import { useState } from "react";
import { colors, fonts } from "../theme";

interface MetadataResult {
  title: string;
  authors: string;
  description: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  tags: string;
  source: string;
  coverUrl: string;
}

const providers = [
  { key: "litres", label: "Litres" },
  { key: "google", label: "Google Books" },
];

export default function MetadataSearch({
  query,
  onApply,
  onClose,
}: {
  query: string;
  onApply: (data: Partial<MetadataResult>) => void;
  onClose: () => void;
}) {
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set(["litres"]));
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<MetadataResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  function fetchResults(provs: Set<string>) {
    setSearching(true);
    fetch(`/api/metadata/search?q=${encodeURIComponent(searchQuery)}&providers=${Array.from(provs).join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        setSearching(false);
      })
      .catch(() => {
        setResults([]);
        setSearching(false);
      });
  }

  function toggleProvider(key: string) {
    const next = new Set(activeProviders);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setActiveProviders(next);
    if (results !== null) fetchResults(next);
  }

  function doSearch() {
    fetchResults(activeProviders);
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "5vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          maxHeight: "90vh",
          backgroundColor: colors.sidebar,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            Получить метаданные
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: colors.textDim,
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Название или ISBN..."
              style={{
                flex: 1,
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 14,
                color: colors.text,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={doSearch}
              disabled={searching}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 6,
                border: "none",
                backgroundColor: colors.accent,
                color: colors.sidebar,
                cursor: searching ? "wait" : "pointer",
                fontWeight: 600,
              }}
            >
              {searching ? "..." : "Поиск"}
            </button>
          </div>
        </div>

        {/* Provider tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {providers.map((p) => {
            const active = activeProviders.has(p.key);
            return (
              <button
                key={p.key}
                onClick={() => toggleProvider(p.key)}
                style={{
                  padding: "8px 16px",
                  margin: "8px 4px 8px 0",
                  marginLeft: p.key === providers[0].key ? 16 : 0,
                  fontSize: 13,
                  fontFamily: "inherit",
                  background: active ? "rgba(249, 190, 3, 0.12)" : "transparent",
                  border: `1px solid ${active ? "rgba(249, 190, 3, 0.3)" : colors.border}`,
                  borderRadius: 16,
                  color: active ? colors.accent : colors.textDim,
                  cursor: "pointer",
                }}
              >
                {active && "✓ "}{p.label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {results === null && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: colors.accent }}>
              Нажмите на обложку, чтобы применить
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          {searching && (
            <div style={{ textAlign: "center", padding: 32, color: colors.textDim }}>
              Поиск...
            </div>
          )}

          {results !== null && !searching && results.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: colors.textDim }}>
              Ничего не найдено
            </div>
          )}

          {results && !searching && results.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "16px 0",
                borderBottom: i < results.length - 1 ? `1px solid ${colors.border}` : "none",
              }}
            >
              {/* Cover thumbnail — clickable */}
              <div
                onClick={() => onApply(r)}
                style={{
                  flexShrink: 0,
                  width: 80,
                  cursor: "pointer",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
                title="Нажмите, чтобы применить метаданные"
              >
                <img
                  src={r.coverUrl ? `/api/metadata/cover-proxy?url=${encodeURIComponent(r.coverUrl)}` : ""}
                  alt={r.title}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {r.title}
                </div>
                <div style={{ fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
                  Автор: {r.authors}
                </div>

                <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 4 }}>
                  Описание:
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: colors.textSecondary,
                    lineHeight: 1.6,
                    marginBottom: 12,
                  }}
                >
                  {r.description}
                </div>

                <div style={{ fontSize: 12, color: colors.textDim }}>
                  Источник:{" "}
                  <span style={{ color: colors.accent }}>{r.source}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 24px",
              fontSize: 13,
              fontFamily: "inherit",
              borderRadius: 6,
              border: "none",
              backgroundColor: colors.accent,
              color: colors.sidebar,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </>
  );
}
