import { FilterKey, SelectedFilters, ApiFilterParams } from "./smart-filter-bar";
import { SortOption } from "./sort-select";

interface PageHeaderCommonProps {
  title: React.ReactNode;
  titleSlot?: React.ReactNode;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (key: string) => void;
  showUpload?: boolean;
  infoSlot?: React.ReactNode;
  breadcrumb?: { label: string; href: string; state?: unknown };
  actionSlot?: React.ReactNode;
}

/**
 * Панель фильтров подключается всеми четырьмя полями сразу или ни одним.
 * onClearAll в наборе обязателен: снимать фильтры по одному нельзя — страницы строят
 * адрес от снимка searchParams текущего рендера, и последовательные переходы затирают
 * друг друга (sza4). Страница с фильтрами, забывшая обработчик сброса, — ошибка
 * типизации, а не тихая регрессия.
 */
type PageHeaderFilterProps =
  | {
    filterKeys?: undefined;
    selected?: undefined;
    onSelectionChange?: undefined;
    onClearAll?: undefined;
    baseFilters?: undefined;
  }
  | {
    filterKeys: FilterKey[];
    selected: SelectedFilters;
    onSelectionChange: (key: FilterKey, values: string[]) => void;
    onClearAll: () => void;
    baseFilters?: ApiFilterParams;
  };

export type PageHeaderProps = PageHeaderCommonProps & PageHeaderFilterProps;
