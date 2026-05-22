import { domainEvents } from "@/domain/events";
import {
  classifyAuthorRenameForBookList,
  classifyBookUpdateForBookList,
  classifyReadingProgressForContext,
  classifyShelfMembershipForContext,
  type ScrollContext,
} from "@/domain/read-models";
import type { BookChangedField, DomainEventMap } from "@/domain/events";

const KEY = "librarium_scroll_state";

export type ScrollEntry = {
  url: string;
  scrollTop: number;
  context?: ScrollContext;
  version: number;
};

type EventBus = typeof domainEvents;
type BookListContext = Extract<ScrollContext, { kind: "book-list" }>;

export type ScrollInvalidationEvent =
  | { kind: "bookCreated" }
  | { kind: "bookDeleted" }
  | { kind: "bookUpdated"; changedFields: BookChangedField[]; affected?: DomainEventMap["bookUpdated"]["affected"] }
  | { kind: "shelfMembershipChanged"; shelfId: number }
  | { kind: "bookRatingChanged" }
  | { kind: "bookReadChanged" }
  | { kind: "bookHiddenChanged" }
  | { kind: "readingProgressChanged"; hasPositionChanged: boolean; lastReadAtChanged: boolean }
  | { kind: "authorRenamed"; authorId: number }
  | { kind: "authorMerged"; targetId: number; sourceId: number }
  | { kind: "authorDeleted"; authorId: number }
  | { kind: "seriesRenamed"; seriesId: number }
  | { kind: "seriesMerged"; targetId: number; sourceId: number }
  | { kind: "seriesDeleted"; seriesId: number }
  | { kind: "tagRenamed"; tagId: number }
  | { kind: "tagMerged"; targetId: number; sourceId: number }
  | { kind: "tagDeleted"; tagId: number }
  | { kind: "shelfCreated" }
  | { kind: "shelfRenamed"; shelfId: number }
  | { kind: "shelfDeleted"; shelfId: number };

export function readScrollEntries(): ScrollEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isScrollEntry)) {
      throw new Error("bad scroll state");
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(KEY);
    return [];
  }
}

export function writeScrollEntries(entries: ScrollEntry[]): void {
  sessionStorage.setItem(KEY, JSON.stringify(entries));
}

export function clearInvalidScrollEntries(event: ScrollInvalidationEvent): void {
  writeScrollEntries(readScrollEntries().filter((entry) => isStillValid(entry, event)));
}

export function registerScrollInvalidationHandlers(bus: EventBus): () => void {
  const unsubscribers = [
    bus.subscribe("bookCreated", () => clearInvalidScrollEntries({ kind: "bookCreated" })),
    bus.subscribe("bookDeleted", () => clearInvalidScrollEntries({ kind: "bookDeleted" })),
    bus.subscribe("bookUpdated", (payload) => clearInvalidScrollEntries({
      kind: "bookUpdated",
      changedFields: payload.changedFields,
      affected: payload.affected,
    })),
    bus.subscribe("shelfMembershipChanged", (payload) => clearInvalidScrollEntries({
      kind: "shelfMembershipChanged",
      shelfId: payload.shelfId,
    })),
    bus.subscribe("bookRatingChanged", () => clearInvalidScrollEntries({ kind: "bookRatingChanged" })),
    bus.subscribe("bookReadChanged", () => clearInvalidScrollEntries({ kind: "bookReadChanged" })),
    bus.subscribe("bookHiddenChanged", () => clearInvalidScrollEntries({ kind: "bookHiddenChanged" })),
    bus.subscribe("readingProgressChanged", (payload) => clearInvalidScrollEntries({
      kind: "readingProgressChanged",
      hasPositionChanged: payload.hadPosition !== payload.hasPosition,
      lastReadAtChanged: payload.lastReadAtChanged,
    })),
    bus.subscribe("authorRenamed", (payload) => clearInvalidScrollEntries({ kind: "authorRenamed", authorId: payload.authorId })),
    bus.subscribe("authorMerged", (payload) => clearInvalidScrollEntries({ kind: "authorMerged", targetId: payload.targetId, sourceId: payload.sourceId })),
    bus.subscribe("authorDeleted", (payload) => clearInvalidScrollEntries({ kind: "authorDeleted", authorId: payload.authorId })),
    bus.subscribe("seriesRenamed", (payload) => clearInvalidScrollEntries({ kind: "seriesRenamed", seriesId: payload.seriesId })),
    bus.subscribe("seriesMerged", (payload) => clearInvalidScrollEntries({ kind: "seriesMerged", targetId: payload.targetId, sourceId: payload.sourceId })),
    bus.subscribe("seriesDeleted", (payload) => clearInvalidScrollEntries({ kind: "seriesDeleted", seriesId: payload.seriesId })),
    bus.subscribe("tagRenamed", (payload) => clearInvalidScrollEntries({ kind: "tagRenamed", tagId: payload.tagId })),
    bus.subscribe("tagMerged", (payload) => clearInvalidScrollEntries({ kind: "tagMerged", targetId: payload.targetId, sourceId: payload.sourceId })),
    bus.subscribe("tagDeleted", (payload) => clearInvalidScrollEntries({ kind: "tagDeleted", tagId: payload.tagId })),
    bus.subscribe("shelfCreated", () => clearInvalidScrollEntries({ kind: "shelfCreated" })),
    bus.subscribe("shelfRenamed", (payload) => clearInvalidScrollEntries({ kind: "shelfRenamed", shelfId: payload.shelfId })),
    bus.subscribe("shelfDeleted", (payload) => clearInvalidScrollEntries({ kind: "shelfDeleted", shelfId: payload.shelfId })),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}

function isStillValid(entry: ScrollEntry, event: ScrollInvalidationEvent): boolean {
  if (event.kind === "bookCreated" || event.kind === "bookDeleted") return false;
  if (!entry.context) return false;
  if (entry.context.kind === "entity-list") return isEntityListStillValid(entry.context.entity, event);
  return isBookListStillValid(entry.context, event);
}

function isBookListStillValid(context: BookListContext, event: ScrollInvalidationEvent): boolean {
  if (event.kind === "bookUpdated") {
    return classifyBookUpdateForBookList(context, event.changedFields, event.affected) !== "structural";
  }
  if (isBookPatchEvent(event)) return isBookPatchStillValid(context, event);
  if (isAuthorEvent(event)) return isAuthorEventStillValid(context, event);
  if (isSeriesEvent(event)) return isSeriesEventStillValid(context, event);
  if (isTagEvent(event)) return isTagEventStillValid(context, event);
  if (isShelfEvent(event)) return isShelfEventStillValid(context, event);
  return true;
}

type BookPatchEvent = Extract<
  ScrollInvalidationEvent,
  | { kind: "shelfMembershipChanged" }
  | { kind: "bookRatingChanged" }
  | { kind: "bookReadChanged" }
  | { kind: "bookHiddenChanged" }
  | { kind: "readingProgressChanged" }
>;

function isBookPatchEvent(event: ScrollInvalidationEvent): event is BookPatchEvent {
  return event.kind === "shelfMembershipChanged"
    || event.kind === "bookRatingChanged"
    || event.kind === "bookReadChanged"
    || event.kind === "bookHiddenChanged"
    || event.kind === "readingProgressChanged";
}

function isBookPatchStillValid(context: BookListContext, event: BookPatchEvent): boolean {
  if (event.kind === "shelfMembershipChanged") {
    return classifyShelfMembershipForContext(context, { shelfId: event.shelfId }) !== "structural";
  }
  if (event.kind === "bookRatingChanged") {
    return classifyBookUpdateForBookList(context, ["rating"]) !== "structural";
  }
  if (event.kind === "bookReadChanged") {
    return classifyBookUpdateForBookList(context, ["read"]) !== "structural";
  }
  if (event.kind === "bookHiddenChanged") return false;
  return classifyReadingProgressForContext(context, event) !== "structural";
}

type AuthorEvent = Extract<
  ScrollInvalidationEvent,
  { kind: "authorRenamed" } | { kind: "authorMerged" } | { kind: "authorDeleted" }
>;

function isAuthorEvent(event: ScrollInvalidationEvent): event is AuthorEvent {
  return event.kind === "authorRenamed" || event.kind === "authorMerged" || event.kind === "authorDeleted";
}

function isAuthorEventStillValid(context: BookListContext, event: AuthorEvent): boolean {
  if (context.source === "search") return false;
  if (event.kind === "authorRenamed") {
    if (context.authorId === event.authorId) return true;
    return classifyAuthorRenameForBookList(context) !== "structural";
  }
  if (context.sort === "authorAsc" || context.sort === "authorDesc") return false;
  if (event.kind === "authorMerged") return isAuthorMergeStillValid(context, event.sourceId, event.targetId);
  return context.authorId !== event.authorId
    && !context.filters?.authorIds?.includes(event.authorId);
}

function isAuthorMergeStillValid(context: BookListContext, sourceId: number, targetId: number): boolean {
  return context.authorId !== sourceId
    && context.authorId !== targetId
    && !context.filters?.authorIds?.some((id) => id === sourceId || id === targetId);
}

type SeriesEvent = Extract<
  ScrollInvalidationEvent,
  { kind: "seriesRenamed" } | { kind: "seriesMerged" } | { kind: "seriesDeleted" }
>;

function isSeriesEvent(event: ScrollInvalidationEvent): event is SeriesEvent {
  return event.kind === "seriesRenamed" || event.kind === "seriesMerged" || event.kind === "seriesDeleted";
}

function isSeriesEventStillValid(context: BookListContext, event: SeriesEvent): boolean {
  if (context.source === "search") return false;
  if (event.kind === "seriesRenamed") return true;
  if (event.kind === "seriesMerged") {
    return context.seriesId !== event.sourceId
      && context.seriesId !== event.targetId
      && !context.filters?.seriesIds?.some((id) => id === event.sourceId || id === event.targetId);
  }
  return context.seriesId !== event.seriesId
    && !context.filters?.seriesIds?.includes(event.seriesId);
}

type TagEvent = Extract<
  ScrollInvalidationEvent,
  { kind: "tagRenamed" } | { kind: "tagMerged" } | { kind: "tagDeleted" }
>;

function isTagEvent(event: ScrollInvalidationEvent): event is TagEvent {
  return event.kind === "tagRenamed" || event.kind === "tagMerged" || event.kind === "tagDeleted";
}

function isTagEventStillValid(context: BookListContext, event: TagEvent): boolean {
  if (context.source === "search") return false;
  if (event.kind === "tagRenamed") return true;
  if (event.kind === "tagMerged") {
    return context.tagId !== event.sourceId
      && context.tagId !== event.targetId
      && !context.filters?.tagIds?.some((id) => id === event.sourceId || id === event.targetId);
  }
  // tagDeleted
  return context.tagId !== event.tagId
    && !context.filters?.tagIds?.includes(event.tagId);
}

type ShelfEvent = Extract<
  ScrollInvalidationEvent,
  { kind: "shelfCreated" } | { kind: "shelfRenamed" } | { kind: "shelfDeleted" }
>;

function isShelfEvent(event: ScrollInvalidationEvent): event is ShelfEvent {
  return event.kind === "shelfCreated" || event.kind === "shelfRenamed" || event.kind === "shelfDeleted";
}

function isShelfEventStillValid(context: BookListContext, event: ShelfEvent): boolean {
  if (event.kind === "shelfDeleted") return context.shelfId !== event.shelfId;
  return true;
}

function isEntityListStillValid(entity: Extract<ScrollContext, { kind: "entity-list" }>["entity"], event: ScrollInvalidationEvent): boolean {
  if (event.kind === "authorRenamed" || event.kind === "authorMerged" || event.kind === "authorDeleted") {
    return entity !== "authors";
  }
  if (event.kind === "seriesRenamed" || event.kind === "seriesMerged" || event.kind === "seriesDeleted") {
    return entity !== "series";
  }
  if (event.kind === "tagRenamed" || event.kind === "tagMerged" || event.kind === "tagDeleted") return entity !== "tags";
  if (event.kind === "shelfCreated" || event.kind === "shelfRenamed") return entity !== "shelves";
  if (event.kind === "shelfDeleted") return entity !== "shelves";
  return true;
}

function isScrollEntry(value: unknown): value is ScrollEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.url === "string"
    && typeof entry.scrollTop === "number"
    && typeof entry.version === "number";
}
