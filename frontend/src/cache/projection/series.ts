import { classifySeriesRenameForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import { patchBookDetailBook } from "./book-detail";
import { hasNumericId, isValidNameRow, isValidSortNameRow, patchSeriesRef } from "./book-list";
import { isRecord } from "./guards";
import { sortByName, sortBySortName } from "./sorts";
import type { ProjectionWriter } from "./writer";

export function applySeriesRename(writer: ProjectionWriter, payload: DomainEventMap["seriesRenamed"]): void {
  const sortName = payload.sortName ?? payload.name;
  const sortNamePatchValue = { sortName };

  writer.updateBookListEntries((entry) => {
    if (!entry.context) return { delete: true };
    if (classifySeriesRenameForBookList(entry.context) === "structural") {
      return { delete: true };
    }
    return {
      value: {
        ...entry.value,
        books: entry.value.books.map((row) => patchSeriesRef(row, payload, sortName)),
      },
    };
  });

  writer.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
    ...entry,
    value: patchBookDetailBook(entry.value, (book) => {
      const series = hasNumericId(book.series) && book.series.id === payload.seriesId
        ? {
          ...book.series,
          name: payload.name,
          ...sortNamePatchValue,
        }
        : book.series;

      return { ...book, series };
    }),
  }));

  writer.patchRowListNamespace<{ id: number; name: string; sortName?: string }>(
    "series",
    "series",
    payload.seriesId,
    { name: payload.name, ...sortNamePatchValue },
    sortBySortName,
    (rows) => rows.every(isValidSortNameRow),
  );

  writer.patchArrayNamespace<{ id: number; name: string }>(
    "filter-options/series",
    payload.seriesId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );
  writer.patchRowListNamespace<{ id: number; name: string }>(
    "filter-options/series",
    "series",
    payload.seriesId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );

  writer.patchDetailNamespace(`series/${payload.seriesId}`, (value) => {
    const series = value.series;
    return isRecord(series)
      ? { ...value, series: { ...series, name: payload.name, ...sortNamePatchValue } }
      : undefined;
  });
}
