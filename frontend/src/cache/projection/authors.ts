import { classifyAuthorRenameForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import { patchBookDetailBook } from "./book-detail";
import { deriveAuthorSortName, isValidNameRow, isValidSortNameRow, patchAuthorRefs } from "./book-list";
import { isRecord } from "./guards";
import { patchNamedRefs } from "./refs";
import { sortByName, sortBySortName } from "./sorts";
import type { ProjectionWriter } from "./writer";

export function applyAuthorRename(writer: ProjectionWriter, payload: DomainEventMap["authorRenamed"]): void {
  const sortName = payload.sortName ?? deriveAuthorSortName(payload.name);
  const sortNamePatchValue = { sortName };

  writer.updateBookListEntries((entry) => {
    if (!entry.context) return { delete: true };
    if (classifyAuthorRenameForBookList(entry.context) === "structural") {
      return { delete: true };
    }
    return {
      value: {
        ...entry.value,
        books: entry.value.books.map((row) => patchAuthorRefs(row, payload, sortName)),
      },
    };
  });

  writer.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
    ...entry,
    value: patchBookDetailBook(entry.value, (book) => {
      const authors = Array.isArray(book.authors)
        ? patchNamedRefs(
          book.authors as Array<{ id: number; name: string; sortName?: string }>,
          payload.authorId,
          { name: payload.name, ...sortNamePatchValue },
        ).refs
        : book.authors;

      return { ...book, authors };
    }),
  }));

  writer.patchRowListNamespace<{ id: number; name: string; sortName?: string }>(
    "authors",
    "authors",
    payload.authorId,
    { name: payload.name, ...sortNamePatchValue },
    sortBySortName,
    (rows) => rows.every(isValidSortNameRow),
  );

  writer.patchArrayNamespace<{ id: number; name: string }>(
    "filter-options/authors",
    payload.authorId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );
  writer.patchRowListNamespace<{ id: number; name: string }>(
    "filter-options/authors",
    "authors",
    payload.authorId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );

  writer.patchNestedRefsInNamespace(
    "series",
    "series",
    "authors",
    payload.authorId,
    { name: payload.name, ...sortNamePatchValue },
  );

  // Симметрично жанрам внутри карточки автора: детальный ответ серии отдаёт её авторов.
  writer.updateNamespacePrefixEntries("series/", (_namespace, entry) => {
    if (!isRecord(entry.value)) return entry;
    const series = entry.value.series;
    if (!isRecord(series) || !Array.isArray(series.authors)) return entry;
    const result = patchNamedRefs(
      series.authors as Array<{ id: number; name: string; sortName?: string }>,
      payload.authorId,
      { name: payload.name, ...sortNamePatchValue },
    );
    if (!result.changed) return entry;
    return { ...entry, value: { ...entry.value, series: { ...series, authors: result.refs } } };
  });

  writer.patchDetailNamespace(`author/${payload.authorId}`, (value) => {
    const author = value.author;
    return isRecord(author)
      ? { ...value, author: { ...author, name: payload.name, ...sortNamePatchValue } }
      : undefined;
  });
}
