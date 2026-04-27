import CloudBadge from "./cloud-badge";

interface CoverOfflineBadgeTokens {
  outerSize: number;
  innerSize: number;
  bottom: number;
  right: number;
}

interface CoverOfflineBadgeProps {
  tokens: CoverOfflineBadgeTokens;
}

export default function CoverOfflineBadge({ tokens }: Readonly<CoverOfflineBadgeProps>) {
  return (
    <div
      data-testid="cover-offline-badge"
      style={{
        position: "absolute",
        bottom: tokens.bottom,
        right: tokens.right,
        width: tokens.outerSize,
        height: tokens.outerSize,
        borderRadius: "50%",
        background: "rgba(249, 190, 3, 0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CloudBadge hasOffline size={tokens.innerSize} />
    </div>
  );
}
