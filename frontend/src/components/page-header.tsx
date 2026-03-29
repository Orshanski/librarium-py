import DesktopPageHeader from "./desktop/desktop-page-header";
import MobilePageHeader from "./mobile/mobile-page-header";
import { useIsMobile } from "../responsive";
import { FilterConfig } from "./filter-bar";
import { SortOption } from "./sort-select";

export default function PageHeader(props: {
  title: React.ReactNode;
  filters?: FilterConfig[];
  selected?: Record<string, string[]>;
  onSelectionChange?: (key: string, values: string[]) => void;
  onClearAll?: () => void;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (key: string) => void;
  showUpload?: boolean;
  infoSlot?: React.ReactNode;
  breadcrumb?: { label: string; href: string };
  actionSlot?: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobilePageHeader {...props} />;
  }

  return <DesktopPageHeader {...props} />;
}
