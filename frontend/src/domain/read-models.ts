import type { BookChangedField } from "./events";

export type ValidityDecision = "patchable" | "structural" | "unaffected";

export type BookListSource =
  | "catalog"
  | "tag-detail"
  | "author-detail"
  | "series-detail"
  | "shelf-regular"
  | "shelf-best"
  | "shelf-reading-now"
  | "search";

export type BookListSort =
  | "addedDesc"
  | "addedAsc"
  | "titleAsc"
  | "titleDesc"
  | "authorAsc"
  | "authorDesc"
  | "ratingDesc"
  | "ratingAsc"
  | "seriesNumber"
  | "lastReadDesc";

export type BookListContext = {
  kind: "book-list";
  source: BookListSource;
  sort: BookListSort;
  key: string;
  filters?: {
    authorIds?: number[];
    seriesIds?: number[];
    tagIds?: number[];
    languages?: string[];
  };
  authorId?: number;
  seriesId?: number;
  tagId?: number;
  shelfId?: number;
  query?: string;
};

export type EntityListContext = {
  kind: "entity-list";
  key: string;
  entity: "authors" | "series" | "tags" | "shelves";
};

export type ScrollContext = BookListContext | EntityListContext;

const RESOLVE_ORDER_SOURCES = new Set<BookListSource>([
  "catalog",
  "tag-detail",
  "shelf-regular",
  "shelf-best",
]);

const MEMBERSHIP_FIELDS = new Set<BookChangedField>(["authors", "series", "tags", "language"]);

export function classifyBookUpdateForBookList(
  context: BookListContext,
  changedFields: BookChangedField[],
  affected?: {
    authorIds?: number[];
    seriesId?: number | null;
    tagIds?: number[];
    language?: string | null;
  },
): ValidityDecision {
  if (context.source === "search") return "structural";
  if (changedFields.some((field) => MEMBERSHIP_FIELDS.has(field)) && isContextAffectedByMembership(context, affected)) {
    return "structural";
  }
  if (changedFields.includes("seriesNumber") && context.source === "series-detail") return "structural";
  if (changedFields.includes("title") && RESOLVE_ORDER_SOURCES.has(context.source)) return "structural";
  if (changedFields.includes("rating") && (context.sort === "ratingAsc" || context.sort === "ratingDesc" || context.source === "shelf-best")) {
    return "structural";
  }
  if (changedFields.includes("read") && context.source === "shelf-reading-now") return "structural";
  return "patchable";
}

function isContextAffectedByMembership(
  context: BookListContext,
  affected?: { authorIds?: number[]; seriesId?: number | null; tagIds?: number[]; language?: string | null },
): boolean {
  if (!affected) return true;
  if (context.authorId !== undefined) return affected.authorIds?.includes(context.authorId) ?? false;
  if (context.seriesId !== undefined) return affected.seriesId === context.seriesId;
  if (context.tagId !== undefined) return affected.tagIds?.includes(context.tagId) ?? false;
  if (context.filters?.authorIds?.some((id) => affected.authorIds?.includes(id))) return true;
  if (context.filters?.seriesIds?.some((id) => affected.seriesId === id)) return true;
  if (context.filters?.tagIds?.some((id) => affected.tagIds?.includes(id))) return true;
  if (affected.language && context.filters?.languages?.includes(affected.language)) return true;
  return context.source === "catalog" || context.source === "shelf-regular" || context.source === "shelf-best";
}

export function classifyAuthorRenameForBookList(context: BookListContext): ValidityDecision {
  if (context.source === "search") return "structural";
  // На странице автора (author-detail) все строки списка — этого же автора;
  // rename главного автора не меняет порядок строк между собой, rename соавтора
  // не сдвигает строки по выбранной сортировке. Безопасно патчить.
  if (context.source === "author-detail") return "patchable";
  return context.sort === "authorAsc" || context.sort === "authorDesc" ? "structural" : "patchable";
}

export function classifyShelfMembershipForContext(
  context: { source: BookListSource; shelfId?: number },
  event: { shelfId: number },
): ValidityDecision {
  if (context.source !== "shelf-regular") return "unaffected";
  return context.shelfId === event.shelfId ? "structural" : "unaffected";
}

export function classifyReadingProgressForContext(
  context: BookListContext,
  event: { hasPositionChanged: boolean; lastReadAtChanged: boolean },
): ValidityDecision {
  if (context.source !== "shelf-reading-now") return "unaffected";
  return event.hasPositionChanged || event.lastReadAtChanged ? "structural" : "patchable";
}
