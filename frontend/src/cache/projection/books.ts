import { classifyBookUpdateForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import { patchBookList } from "./book-list";
import type { ProjectionWriter } from "./writer";

export function applyBookRowPatch(writer: ProjectionWriter, book: { id: number } & Record<string, unknown>): void {
  writer.updateBookListEntries((entry) => ({ value: patchBookList(entry.value, book) }));
}

export function applyBookUpdate(writer: ProjectionWriter, payload: DomainEventMap["bookUpdated"]): void {
  writer.updateBookListEntries((entry) => {
    if (!entry.context) return { delete: true };
    const decision = classifyBookUpdateForBookList(
      entry.context,
      payload.changedFields,
      payload.affected,
    );
    if (decision === "structural") return { delete: true };
    return { value: patchBookList(entry.value, payload.book) };
  });
}
