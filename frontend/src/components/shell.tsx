import DesktopShell from "./desktop/desktop-shell";
import MobileShell from "./mobile/mobile-shell";
import { useIsMobile } from "../responsive";

export default function Shell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileShell>{children}</MobileShell>;
  }

  return <DesktopShell>{children}</DesktopShell>;
}
