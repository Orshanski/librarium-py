import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clearedFilters, readSelectedFromSearchParams } from "@/api/filter-types";
import type { FilterKey, SelectedFilters } from "@/api/filter-types";

export interface FilterParams {
  /** Выбранные фильтры, прочитанные из адресной строки. */
  selected: SelectedFilters;
  /** Обновляет ключи адреса: значение undefined убирает ключ целиком. */
  updateParams: (updates: Record<string, string[] | undefined>) => void;
  /** Меняет один фильтр; пустой список убирает его из адреса. */
  onSelectionChange: (key: FilterKey, values: string[]) => void;
  /** Снимает все фильтры одним переходом, сохраняя прочие параметры (в том числе sort). */
  clearAllFilters: () => void;
}

/**
 * Работа страницы-списка с фильтрами в адресной строке.
 *
 * Один переход на одно действие — принципиально. Адрес строится от снимка
 * searchParams текущего рендера, поэтому два последовательных перехода внутри
 * одного обработчика затирают друг друга: доезжает последний. Именно так
 * ломалась кнопка «Сбросить все», снимавшая фильтры по одному (sza4).
 * Отсюда clearAllFilters снимает все ключи разом, а не циклом.
 *
 * @param basePath путь страницы без строки запроса, например "/authors" или `/tags/${tagId}`.
 */
export function useFilterParams(basePath: string): FilterParams {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selected = useMemo(() => readSelectedFromSearchParams(searchParams), [searchParams]);

  const updateParams = useCallback((updates: Record<string, string[] | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, values] of Object.entries(updates)) {
      params.delete(key);
      if (values) {
        for (const value of values) params.append(key, value);
      }
    }
    const qs = params.toString();
    navigate(qs ? `${basePath}?${qs}` : basePath);
  }, [searchParams, navigate, basePath]);

  const onSelectionChange = useCallback((key: FilterKey, values: string[]) => {
    updateParams({ [key]: values.length > 0 ? values : undefined });
  }, [updateParams]);

  const clearAllFilters = useCallback(() => {
    updateParams(clearedFilters());
  }, [updateParams]);

  return { selected, updateParams, onSelectionChange, clearAllFilters };
}
