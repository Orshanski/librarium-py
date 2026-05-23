const noCaseComparator = new Intl.Collator(undefined, {
  sensitivity: "accent",
  usage: "sort",
});

function compareByText(left: string, right: string, leftIndex: number, rightIndex: number): number {
  const primary = noCaseComparator.compare(left, right);
  if (primary !== 0) return primary;

  const secondary = left.localeCompare(right);
  if (secondary !== 0) return secondary;

  return leftIndex - rightIndex;
}

export function sortByName<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => compareByText(left.row.name, right.row.name, left.index, right.index))
    .map(({ row }) => row);
}

export function sortBySortName<T extends { sortName?: string; name: string }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({
      index,
      row,
      sortKey: row.sortName ?? row.name,
    }))
    .sort((left, right) => compareByText(left.sortKey, right.sortKey, left.index, right.index))
    .map(({ row }) => row);
}
