export type RowWithId = { id: number } & Record<string, unknown>;

export type RowUpdateResult<T extends RowWithId> = {
  rows: T[];
  changed: boolean;
};

export function mergeRowById<T extends RowWithId>(
  rows: readonly T[],
  id: number,
  patch: Partial<T>,
): RowUpdateResult<T> {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== id) return row;
    const merged = { ...row, ...patch };
    if (!shallowEqual(row, merged)) changed = true;
    return merged;
  });

  return { rows: changed ? next : [...rows], changed };
}

export function dropRowById<T extends RowWithId>(rows: readonly T[], id: number): RowUpdateResult<T> {
  const next = rows.filter((row) => row.id !== id);
  return { rows: next, changed: next.length !== rows.length };
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}
