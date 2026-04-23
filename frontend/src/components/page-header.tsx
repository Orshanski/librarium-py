import DesktopPageHeader from "./desktop/desktop-page-header";
import MobilePageHeader from "./mobile/mobile-page-header";
import { useIsMobile } from "../responsive";
import { PageHeaderProps } from "./page-header.types";

export default function PageHeader(props: Readonly<PageHeaderProps>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobilePageHeader {...props} />;
  }

  return <DesktopPageHeader {...props} />;
}
