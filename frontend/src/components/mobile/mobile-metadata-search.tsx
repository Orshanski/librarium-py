import { colors, fonts } from "../../theme";
import { MetadataSearchViewProps, metadataProviders } from "../metadata-search.types";

export default function MobileMetadataSearch({
  searching,
  results,
  error,
  activeProviders,
  searchQuery,
  onClose,
  onSetSearchQuery,
  onSearch,
  onToggleProvider,
  onApply,
}: MetadataSearchViewProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.72)",
          zIndex: 200,
        }}
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: colors.sidebar,
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
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
            Метаданные
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: colors.textDim,
              fontSize: 20,
              cursor: "pointer",
              padding: 12,
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Название или ISBN..."
              style={{
                width: "100%",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 14,
                color: colors.text,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={onSearch}
              disabled={searching}
              style={{
                width: "100%",
                minHeight: 40,
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 8,
                border: "none",
                backgroundColor: colors.accent,
                color: colors.sidebar,
                cursor: searching ? "wait" : "pointer",
                fontWeight: 600,
              }}
            >
              {searching ? "Поиск..." : "Поиск"}
            </button>
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
            {metadataProviders.map((p) => {
              const active = activeProviders.has(p.key);
              return (
                <button
                  key={p.key}
                  onClick={() => onToggleProvider(p.key)}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: active ? "rgba(249, 190, 3, 0.12)" : "transparent",
                    border: `1px solid ${active ? "rgba(249, 190, 3, 0.3)" : colors.border}`,
                    borderRadius: 16,
                    color: active ? colors.accent : colors.textDim,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {active && "✓ "}{p.label}
                </button>
              );
            })}
          </div>
          {results === null && (
            <div style={{ paddingTop: 8, fontSize: 11, color: colors.accent }}>
              Нажмите на обложку, чтобы применить
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px 20px" }}>
          {searching && (
            <div style={{ textAlign: "center", padding: 32, color: colors.textDim }}>
              Поиск...
            </div>
          )}

          {error && !searching && (
            <div style={{ textAlign: "center", padding: 32, color: colors.danger }}>
              {error}
            </div>
          )}

          {results !== null && !searching && !error && results.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: colors.textDim }}>
              Ничего не найдено
            </div>
          )}

          {results && !searching && !error && results.map((r, i) => (
            <div
              key={`${r.source}:${r.title}:${r.authors}:${i}`}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 0",
                borderBottom: i < results.length - 1 ? `1px solid ${colors.border}` : "none",
              }}
            >
              <div
                onClick={() => onApply(r)}
                style={{
                  flexShrink: 0,
                  width: 72,
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: `1px solid ${colors.border}`,
                }}
                title="Нажмите, чтобы применить метаданные"
              >
                {r.coverUrl ? (
                  <img
                    src={`/api/metadata/cover-proxy?url=${encodeURIComponent(r.coverUrl)}`}
                    alt={r.title}
                    style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "2 / 3", backgroundColor: colors.bg }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: colors.text, marginBottom: 4, lineHeight: 1.25 }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 8 }}>
                  {r.authors}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    lineHeight: 1.55,
                    marginBottom: 10,
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {r.description}
                </div>
                <div style={{ fontSize: 11, color: colors.textDim }}>
                  Источник: <span style={{ color: colors.accent }}>{r.source}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
