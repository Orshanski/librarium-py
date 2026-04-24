import { colors } from "../theme";

interface CloudBadgeProps {
  hasOffline: boolean;
  size?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CloudBadge({ hasOffline, size = 16, onClick, style }: Readonly<CloudBadgeProps>) {
  if (!hasOffline && !onClick) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={hasOffline ? colors.accent : "#888"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        opacity: hasOffline ? 1 : 0.35,
        ...style,
      }}
      onClick={onClick ? (e) => { e.preventDefault(); e.stopPropagation(); onClick(); } : undefined}
    >
      {hasOffline ? (
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
