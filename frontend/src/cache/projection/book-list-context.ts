import type { BookListContext } from "@/domain/read-models";

const BOOK_LIST_SOURCES = new Set([
  "catalog",
  "tag-detail",
  "author-detail",
  "series-detail",
  "shelf-regular",
  "shelf-best",
  "shelf-reading-now",
  "search",
]);

const BOOK_LIST_SORTS = new Set([
  "addedDesc",
  "addedAsc",
  "titleAsc",
  "titleDesc",
  "authorAsc",
  "authorDesc",
  "ratingDesc",
  "ratingAsc",
  "seriesNumber",
  "lastReadDesc",
]);

export function isBookListContext(value: unknown): value is BookListContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return isBaseBookListContext(context)
    && hasValidOptionalContextFields(context)
    && hasValidSourceSpecificFields(context);
}

function isBaseBookListContext(context: Record<string, unknown>): boolean {
  return context.kind === "book-list"
    && typeof context.key === "string"
    && typeof context.source === "string"
    && BOOK_LIST_SOURCES.has(context.source)
    && typeof context.sort === "string"
    && BOOK_LIST_SORTS.has(context.sort);
}

function hasValidOptionalContextFields(context: Record<string, unknown>): boolean {
  return isOptionalNumber(context.authorId)
    && isOptionalNumber(context.seriesId)
    && isOptionalNumber(context.tagId)
    && isOptionalNumber(context.shelfId)
    && (context.query === undefined || typeof context.query === "string")
    && isFilters(context.filters);
}

function hasValidSourceSpecificFields(context: Record<string, unknown>): boolean {
  return matchesSourceNumberField(context, "author-detail", "authorId")
    && matchesSourceNumberField(context, "series-detail", "seriesId")
    && matchesSourceNumberField(context, "tag-detail", "tagId")
    && matchesShelfSourceField(context);
}

function matchesSourceNumberField(context: Record<string, unknown>, source: string, field: string): boolean {
  if (context.source === source) return typeof context[field] === "number";
  return context[field] === undefined;
}

function matchesShelfSourceField(context: Record<string, unknown>): boolean {
  if (isShelfSource(context.source)) return typeof context.shelfId === "number";
  return context.shelfId === undefined;
}

function isShelfSource(source: unknown): boolean {
  return source === "shelf-regular" || source === "shelf-best" || source === "shelf-reading-now";
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isFilters(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  return isOptionalNumberArray(filters.authorIds)
    && isOptionalNumberArray(filters.seriesIds)
    && isOptionalNumberArray(filters.tagIds)
    && isOptionalStringArray(filters.languages);
}

function isOptionalNumberArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "number"));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}
