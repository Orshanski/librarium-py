import { colors, fonts } from "../../theme";
import { MetadataSearchViewProps, metadataProviders } from "../metadata-search.types";

export default function DesktopMetadataSearch({
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
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 200,
        }}
      />

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

        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
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
              onClick={onSearch}
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

        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {metadataProviders.map((p) => {
            const active = activeProviders.has(p.key);
            return (
              <button
                key={p.key}
                onClick={() => onToggleProvider(p.key)}
                style={{
                  padding: "8px 16px",
                  margin: "8px 4px 8px 0",
                  marginLeft: p.key === metadataProviders[0].key ? 16 : 0,
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

        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
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
                gap: 16,
                padding: "16px 0",
                borderBottom: i < results.length - 1 ? `1px solid ${colors.border}` : "none",
              }}
            >
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
                {r.coverUrl ? (
                  <img
                    src={`/api/metadata/cover-proxy?url=${encodeURIComponent(r.coverUrl)}`}
                    alt={r.title}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "2 / 3", backgroundColor: colors.bg }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: colors.text, marginBottom: 4 }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
                  Автор: {r.authors}
                </div>

                <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 4 }}>Описание:</div>
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
                  Источник: <span style={{ color: colors.accent }}>{r.source}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

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
