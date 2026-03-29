import { FilterConfig } from "./filter-bar";
import { SortOption } from "./sort-select";

export interface PageHeaderProps {
  title: React.ReactNode;
  titleSlot?: React.ReactNode;
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
  mobileActionSlot?: React.ReactNode;
}
