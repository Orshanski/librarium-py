import type { BookListContext, BookListSort, EntityListContext } from "@/domain/read-models";

export function toNumericIds(values: readonly string[]): number[] {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

export function catalogScrollContext(params: {
  key: string;
  sort: string;
  authorIds?: readonly string[];
  seriesIds?: readonly string[];
  tagIds?: readonly string[];
  languages?: readonly string[];
}): BookListContext {
  const filters = {
    authorIds: params.authorIds ? toNumericIds(params.authorIds) : [],
    seriesIds: params.seriesIds ? toNumericIds(params.seriesIds) : [],
    tagIds: params.tagIds ? toNumericIds(params.tagIds) : [],
    languages: params.languages ? [...params.languages] : [],
  };

  return {
    kind: "book-list",
    key: params.key,
    source: "catalog",
    sort: params.sort as BookListSort,
    filters: {
      ...(filters.authorIds.length ? { authorIds: filters.authorIds } : {}),
      ...(filters.seriesIds.length ? { seriesIds: filters.seriesIds } : {}),
      ...(filters.tagIds.length ? { tagIds: filters.tagIds } : {}),
      ...(filters.languages.length ? { languages: filters.languages } : {}),
    },
  };
}

export function tagScrollContext(params: {
  key: string;
  tagId: number;
  sort: string;
  authorIds?: readonly string[];
  seriesIds?: readonly string[];
  languages?: readonly string[];
}): BookListContext {
  const base = catalogScrollContext({
    key: params.key,
    sort: params.sort,
    authorIds: params.authorIds,
    seriesIds: params.seriesIds,
    languages: params.languages,
  });
  return {
    ...base,
    source: "tag-detail",
    tagId: params.tagId,
  };
}

export function authorScrollContext(key: string, authorId: number): BookListContext {
  return {
    kind: "book-list",
    key,
    source: "author-detail",
    sort: "authorAsc",
    authorId,
  };
}

export function seriesScrollContext(key: string, seriesId: number): BookListContext {
  return {
    kind: "book-list",
    key,
    source: "series-detail",
    sort: "seriesNumber",
    seriesId,
  };
}

export function shelfScrollContext(params: {
  key: string;
  shelfId: number;
  systemCode?: string | null;
  sort: string;
}): BookListContext {
  const source = params.systemCode === "best"
    ? "shelf-best"
    : params.systemCode === "reading_now"
      ? "shelf-reading-now"
      : "shelf-regular";
  return {
    kind: "book-list",
    key: params.key,
    source,
    sort: params.sort as BookListSort,
    shelfId: params.shelfId,
  };
}

export function searchScrollContext(key: string, query: string): BookListContext {
  return {
    kind: "book-list",
    key,
    source: "search",
    sort: "addedDesc",
    query,
  };
}

export function entityListScrollContext(
  key: string,
  entity: EntityListContext["entity"],
): EntityListContext {
  return {
    kind: "entity-list",
    key,
    entity,
  };
}
