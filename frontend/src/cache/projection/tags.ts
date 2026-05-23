import { classifyTagRenameForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import { patchBookDetailBook } from "./book-detail";
import { isValidNameRow, patchTagRefs } from "./book-list";
import { isRecord } from "./guards";
import { patchNamedRefs } from "./refs";
import { sortByName } from "./sorts";
import type { ProjectionWriter } from "./writer";

export function applyTagRename(writer: ProjectionWriter, payload: DomainEventMap["tagRenamed"]): void {
  writer.updateBookListEntries((entry) => {
    if (!entry.context) return { delete: true };
    if (classifyTagRenameForBookList(entry.context) === "structural") {
      return { delete: true };
    }
    return {
      value: {
        ...entry.value,
        books: entry.value.books.map((row) => patchTagRefs(row, payload)),
      },
    };
  });

  writer.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
    ...entry,
    value: patchBookDetailBook(entry.value, (book) => {
      const tags = Array.isArray(book.tags)
        ? patchNamedRefs(
          book.tags as Array<{ id: number; name: string }>,
          payload.tagId,
          { name: payload.name },
        ).refs
        : book.tags;

      return { ...book, tags };
    }),
  }));

  writer.patchRowListNamespace<{ id: number; name: string }>(
    "tags",
    "tags",
    payload.tagId,
    { name: payload.name },
    (rows, key) => (key === "cloud?top=30" ? rows : sortByName(rows)),
    (rows) => rows.every(isValidNameRow),
  );

  writer.patchArrayNamespace<{ id: number; name: string }>(
    "filter-options/tags",
    payload.tagId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );
  writer.patchRowListNamespace<{ id: number; name: string }>(
    "filter-options/tags",
    "tags",
    payload.tagId,
    { name: payload.name },
    sortByName,
    (rows) => rows.every(isValidNameRow),
  );

  writer.patchNestedRefsInNamespace(
    "authors",
    "authors",
    "tags",
    payload.tagId,
    { name: payload.name },
  );

  writer.patchDetailNamespace(`tag/${payload.tagId}`, (value) => {
    const tag = value.tag;
    return isRecord(tag) ? { ...value, tag: { ...tag, name: payload.name } } : undefined;
  });
}
