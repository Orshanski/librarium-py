import { useIsMobile } from "../responsive";
import DesktopBookRail from "./desktop/desktop-book-rail";
import MobileBookRail from "./mobile/mobile-book-rail";

export default function BookRail({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileBookRail>{children}</MobileBookRail>;
  }

  return <DesktopBookRail>{children}</DesktopBookRail>;
}
