import { FilterKey, SelectedFilters, ApiFilterParams } from "./smart-filter-bar";
import { SortOption } from "./sort-select";

export interface PageHeaderProps {
  title: React.ReactNode;
  titleSlot?: React.ReactNode;
  filterKeys?: FilterKey[];
  selected?: SelectedFilters;
  onSelectionChange?: (key: FilterKey, values: string[]) => void;
  onClearAll?: () => void;
  baseFilters?: ApiFilterParams;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (key: string) => void;
  showUpload?: boolean;
  infoSlot?: React.ReactNode;
  breadcrumb?: { label: string; href: string; state?: unknown };
  actionSlot?: React.ReactNode;
}
