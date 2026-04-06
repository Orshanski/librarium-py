import { colors } from "../theme";

interface CloudBadgeProps {
  cached: boolean;
  size?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CloudBadge({ cached, size = 16, onClick, style }: CloudBadgeProps) {
  if (!cached && !onClick) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={cached ? colors.accent : "#888"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        opacity: cached ? 1 : 0.35,
        ...style,
      }}
      onClick={onClick ? (e) => { e.preventDefault(); e.stopPropagation(); onClick(); } : undefined}
    >
      {cached ? (
        <>
          <path d="M8 17l4 4 4-4" />
          <path d="M12 12v9" />
          <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
        </>
      ) : (
        <>
          <path d="M12 16v-8" />
          <path d="M8 12l4-4 4 4" />
          <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
        </>
      )}
    </svg>
  );
}
