import { colors, fonts } from "../theme";

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Удалить",
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "30vh", left: "50%", transform: "translateX(-50%)",
        width: 360, backgroundColor: colors.sidebar, border: `1px solid ${colors.border}`,
        borderRadius: 12, padding: "24px 28px", zIndex: 301,
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 15, color: colors.text, marginBottom: 24, lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
            border: `1px solid ${colors.border}`, backgroundColor: "transparent",
            color: colors.textSecondary, cursor: "pointer",
          }}>
            Отмена
          </button>
          <button onClick={onConfirm} style={{
            padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
            border: "none", backgroundColor: colors.danger, color: "#fff",
            cursor: "pointer", fontWeight: 600,
          }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
