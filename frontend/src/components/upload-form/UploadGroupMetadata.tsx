import { colors } from "../../theme";
import type { UploadMetadata } from "@/api/endpoints/upload";

interface Props {
  metadata: UploadMetadata;
}

export default function UploadGroupMetadata({ metadata }: Props) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {metadata.coverUrl && (
        <img src={metadata.coverUrl} alt="" style={{ width: 60, height: 90, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 12px", fontSize: 13, alignContent: "start" }}>
        <span style={{ color: colors.textDim }}>Название</span>
        <span style={{ color: colors.text }}>{metadata.title || "—"}</span>
        <span style={{ color: colors.textDim }}>Авторы</span>
        <span style={{ color: colors.textSecondary }}>{metadata.authors || "—"}</span>
        {metadata.series && <>
          <span style={{ color: colors.textDim }}>Серия</span>
          <span style={{ color: colors.textSecondary }}>{metadata.series} {metadata.seriesNumber && `#${metadata.seriesNumber}`}</span>
        </>}
        <span style={{ color: colors.textDim }}>Язык</span>
        <span style={{ color: colors.textSecondary }}>{metadata.language || "—"}</span>
        <span style={{ color: colors.textDim }}>Жанры</span>
        <span style={{ color: colors.textSecondary }}>{metadata.tags || "—"}</span>
      </div>
    </div>
  );
}
