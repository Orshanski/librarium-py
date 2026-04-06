import DesktopShell from "./desktop/desktop-shell";
import MobileShell from "./mobile/mobile-shell";
import { useIsMobile } from "../responsive";
import { useUpdateAvailable } from "../hooks/useUpdateAvailable";
import { colors } from "../theme";

export default function Shell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [updateAvailable, reload] = useUpdateAvailable();

  const content = (
    <>
      {updateAvailable && <UpdateBanner onReload={reload} />}
      {children}
    </>
  );

  if (isMobile) {
    return <MobileShell>{content}</MobileShell>;
  }

  return <DesktopShell>{content}</DesktopShell>;
}

function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "8px 16px",
        backgroundColor: "rgba(249, 190, 3, 0.1)",
        borderBottom: `1px solid rgba(249, 190, 3, 0.2)`,
        fontSize: 13,
        color: colors.text,
      }}
    >
      <span>Доступно обновление</span>
      <button
        onClick={onReload}
        style={{
          background: "none",
          border: `1px solid rgba(249, 190, 3, 0.3)`,
          borderRadius: 6,
          padding: "4px 12px",
          fontSize: 12,
          fontFamily: "inherit",
          color: colors.accent,
          cursor: "pointer",
        }}
      >
        Обновить
      </button>
    </div>
  );
}
