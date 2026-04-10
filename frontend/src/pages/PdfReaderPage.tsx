import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../responsive";
import { colors } from "../theme";
import { exitReader } from "../utils/readerFlag";
import DesktopPdfReaderPage from "./desktop/DesktopPdfReaderPage";

export default function PdfReaderPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          padding: 24,
          textAlign: "center",
          backgroundColor: colors.bg,
          color: colors.textDim,
          gap: 16,
        }}
      >
        <div style={{ fontSize: 15, color: colors.text, fontWeight: 600 }}>
          Чтение PDF доступно только на десктопе
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          Скачайте файл или откройте библиотеку на компьютере.
        </div>
        <button
          onClick={() => exitReader(navigate)}
          style={{
            marginTop: 8,
            background: "none",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            color: colors.accent,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Назад
        </button>
      </div>
    );
  }

  return <DesktopPdfReaderPage />;
}
