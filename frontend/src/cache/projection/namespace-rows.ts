import { isRecord } from "./guards";
import { patchNamedRefs } from "./refs";
import { mergeRowById } from "./rows";

type RowWithId = { id: number } & Record<string, unknown>;
type RowSorter<T extends RowWithId> = (rows: T[], key: string) => T[];

export function patchObjectRowListValue<T extends RowWithId>(
  value: unknown,
  field: string,
  id: number,
  patch: Partial<T>,
  sorter: RowSorter<T>,
  key: string,
  canSortRows?: (rows: readonly T[]) => boolean,
): unknown | undefined {
  if (!isRecord(value)) return undefined;
  const rows = value[field];
  if (!Array.isArray(rows)) return undefined;
  const nextRows = patchRowsById(rows, id, patch, sorter, key, canSortRows);
  return nextRows === undefined ? undefined : { ...value, [field]: nextRows };
}

export function patchArrayRowListValue<T extends RowWithId>(
  value: unknown,
  id: number,
  patch: Partial<T>,
  sorter: RowSorter<T>,
  key: string,
  canSortRows?: (rows: readonly T[]) => boolean,
): unknown | undefined {
  if (!Array.isArray(value)) return undefined;
  return patchRowsById(value, id, patch, sorter, key, canSortRows);
}

export function patchNestedRefsValue(
  value: unknown,
  listField: string,
  refField: string,
  id: number,
  patch: Partial<{ id: number; name: string; sortName?: string }>,
): unknown | undefined {
  if (!isRecord(value)) return undefined;
  const rows = value[listField];
  if (!Array.isArray(rows)) return undefined;
  let changed = false;
  const nextRows = rows.map((row) => {
    if (!isRecord(row) || !Array.isArray(row[refField])) return row;
    const result = patchNamedRefs(
      row[refField] as Array<{ id: number; name: string; sortName?: string }>,
      id,
      patch,
    );
    if (!result.changed) return row;
    changed = true;
    return { ...row, [refField]: result.refs };
  });
  return changed ? { ...value, [listField]: nextRows } : undefined;
}

function patchRowsById<T extends RowWithId>(
  rows: unknown[],
  id: number,
  patch: Partial<T>,
  sorter: RowSorter<T>,
  key: string,
  canSortRows?: (rows: readonly T[]) => boolean,
): T[] | undefined {
  const result = mergeRowById(rows as T[], id, patch);
  if (!result.changed) return undefined;
  const rowsAreMalformed = rows.some((row) => !isRecord(row) || typeof (row as { id?: unknown }).id !== "number");
  if (rowsAreMalformed || canSortRows === undefined || !canSortRows(result.rows)) {
    return result.rows;
  }
  return sorter(result.rows, key);
}
