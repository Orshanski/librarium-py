import { useIsMobile } from "../responsive";
import DesktopBookGrid from "./desktop/desktop-book-grid";
import MobileBookGrid from "./mobile/mobile-book-grid";

export default function BookGrid({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileBookGrid>{children}</MobileBookGrid>;
  }

  return <DesktopBookGrid>{children}</DesktopBookGrid>;
}
