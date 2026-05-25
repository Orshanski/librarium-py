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
    seriesIds?: Array<number | null>;
    tagIds?: number[];
    language?: string | null;
    languages?: Array<string | null>;
  },
): ValidityDecision {
  if (context.source === "search") return "structural";
  if (
    changedFields.includes("authors")
    && (context.sort === "authorAsc" || context.sort === "authorDesc")
    && canMembershipChangedBookAppearInContext(context, affected)
  ) {
    return "structural";
  }
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
  affected?: {
    authorIds?: number[];
    seriesId?: number | null;
    seriesIds?: Array<number | null>;
    tagIds?: number[];
    language?: string | null;
    languages?: Array<string | null>;
  },
): boolean {
  if (!affected) return true;
  if (context.authorId !== undefined) return affected.authorIds?.includes(context.authorId) ?? false;
  if (context.seriesId !== undefined) return affectedSeriesIds(affected).includes(context.seriesId);
  if (context.tagId !== undefined) return affected.tagIds?.includes(context.tagId) ?? false;
  if (context.filters?.authorIds?.some((id) => affected.authorIds?.includes(id))) return true;
  if (context.filters?.seriesIds?.some((id) => affectedSeriesIds(affected).includes(id))) return true;
  if (context.filters?.tagIds?.some((id) => affected.tagIds?.includes(id))) return true;
  if (context.filters?.languages?.some((language) => affectedLanguages(affected).includes(language))) return true;
  return false;
}

function canMembershipChangedBookAppearInContext(
  context: BookListContext,
  affected?: {
    authorIds?: number[];
    seriesId?: number | null;
    seriesIds?: Array<number | null>;
    tagIds?: number[];
    language?: string | null;
    languages?: Array<string | null>;
  },
): boolean {
  if (!affected) return true;
  if (isContextAffectedByMembership(context, affected)) return true;
  if (hasMembershipFilters(context)) return false;
  return context.source === "catalog" || context.source === "shelf-regular" || context.source === "shelf-best";
}

function hasMembershipFilters(context: BookListContext): boolean {
  return Boolean(
    context.filters?.authorIds?.length
    || context.filters?.seriesIds?.length
    || context.filters?.tagIds?.length
    || context.filters?.languages?.length,
  );
}

function affectedSeriesIds(affected: { seriesId?: number | null; seriesIds?: Array<number | null> }): number[] {
  return [...(affected.seriesIds ?? []), affected.seriesId]
    .filter((id): id is number => typeof id === "number");
}

function affectedLanguages(affected: { language?: string | null; languages?: Array<string | null> }): string[] {
  return [...(affected.languages ?? []), affected.language]
    .filter((language): language is string => typeof language === "string" && language.length > 0);
}

export function classifyAuthorRenameForBookList(context: BookListContext): ValidityDecision {
  if (context.source === "search") return "structural";
  // На странице автора (author-detail) все строки списка — этого же автора;
  // rename главного автора не меняет порядок строк между собой, rename соавтора
  // не сдвигает строки по выбранной сортировке. Безопасно патчить.
  if (context.source === "author-detail") return "patchable";
  return context.sort === "authorAsc" || context.sort === "authorDesc" ? "structural" : "patchable";
}

export function classifySeriesRenameForBookList(context: BookListContext): ValidityDecision {
  if (context.source === "search") return "structural";
  // На странице серии (series-detail) все строки списка — этой же серии;
  // rename имени серии не меняет порядок строк (сортировка seriesNumber — по числовому
  // полю книги, не зависит от имени серии).
  if (context.source === "series-detail") return "patchable";
  // В BookListSort нет сортировок по имени серии (seriesAsc/seriesDesc отсутствуют),
  // поэтому переименование серии в принципе не может сломать сортировку никакой записи.
  return "patchable";
}

export function classifyTagRenameForBookList(context: BookListContext): ValidityDecision {
  if (context.source === "search") return "structural";
  // На странице тега (tag-detail) все строки списка несут этот тег; name
  // обновится через патч namespace tag/{tagId} на втором шаге applyTagRename.
  if (context.source === "tag-detail") return "patchable";
  // В BookListSort нет сортировок по имени тега (tagAsc/tagDesc отсутствуют),
  // поэтому переименование тега не может сломать сортировку ни в каком контексте.
  return "patchable";
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
