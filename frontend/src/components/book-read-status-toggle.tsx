import type { CSSProperties } from "react";
import { colors } from "../theme";

interface BookReadStatusToggleProps {
  isRead: boolean;
  onToggle: () => void;
}

export default function BookReadStatusToggle({
  isRead,
  onToggle,
}: Readonly<BookReadStatusToggleProps>) {
  const style: CSSProperties = {
    background: "transparent",
    border: `1px solid ${isRead ? colors.success : colors.border}`,
    borderRadius: 18,
    padding: "6px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    color: isRead ? colors.success : colors.textDim,
    cursor: "pointer",
    transition: "all 0.15s",
  };

  return (
    <button type="button" onClick={onToggle} style={style} aria-pressed={isRead}>
      {isRead ? "✓ Прочитано" : "Не прочитано"}
    </button>
  );
}
