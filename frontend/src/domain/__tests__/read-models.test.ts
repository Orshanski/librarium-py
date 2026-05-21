import { describe, expect, it } from "vitest";
import {
  classifyAuthorRenameForBookList,
  classifyBookUpdateForBookList,
  classifyReadingProgressForContext,
  classifySeriesRenameForBookList,
  classifyShelfMembershipForContext,
  type BookListContext,
} from "../read-models";

const catalogAdded: BookListContext = { kind: "book-list", key: "/catalog", source: "catalog", sort: "addedDesc" };
const authorDetail: BookListContext = { kind: "book-list", key: "/authors/3", source: "author-detail", authorId: 3, sort: "addedDesc" };
const seriesDetail: BookListContext = { kind: "book-list", key: "/series/4", source: "series-detail", seriesId: 4, sort: "seriesNumber" };
const bestShelf: BookListContext = { kind: "book-list", key: "/shelves/best", source: "shelf-best", sort: "ratingDesc" };
const readingNow: BookListContext = { kind: "book-list", key: "/shelves/reading-now", source: "shelf-reading-now", sort: "lastReadDesc" };

describe("read-model validity", () => {
  it("treats title changes as structural for catalog sorted through resolve_order_clause", () => {
    expect(classifyBookUpdateForBookList(catalogAdded, ["title"])).toBe("structural");
  });

  it("treats title changes as patchable for author and series detail ordering", () => {
    expect(classifyBookUpdateForBookList(authorDetail, ["title"])).toBe("patchable");
    expect(classifyBookUpdateForBookList(seriesDetail, ["title"])).toBe("patchable");
  });

  it("treats author rename as structural only for author-sorted book lists", () => {
    expect(classifyAuthorRenameForBookList({ ...catalogAdded, sort: "authorAsc" })).toBe("structural");
    expect(classifyAuthorRenameForBookList(catalogAdded)).toBe("patchable");
  });

  it("treats author rename as patchable for author-detail regardless of sort", () => {
    const authorDetailByAuthor: BookListContext = {
      kind: "book-list",
      key: "/authors/3",
      source: "author-detail",
      authorId: 3,
      sort: "authorAsc",
    };
    const authorDetailAdded: BookListContext = {
      kind: "book-list",
      key: "/authors/3",
      source: "author-detail",
      authorId: 3,
      sort: "addedDesc",
    };
    expect(classifyAuthorRenameForBookList(authorDetailByAuthor)).toBe("patchable");
    expect(classifyAuthorRenameForBookList(authorDetailAdded)).toBe("patchable");
  });

  it("classifySeriesRenameForBookList: series-detail patchable независимо от сортировки", () => {
    const seriesDetailByNumber: BookListContext = {
      kind: "book-list",
      key: "/series/4",
      source: "series-detail",
      seriesId: 4,
      sort: "seriesNumber",
    };
    const seriesDetailByAuthor: BookListContext = {
      kind: "book-list",
      key: "/series/4",
      source: "series-detail",
      seriesId: 4,
      sort: "authorAsc",
    };
    expect(classifySeriesRenameForBookList(seriesDetailByNumber)).toBe("patchable");
    expect(classifySeriesRenameForBookList(seriesDetailByAuthor)).toBe("patchable");
  });

  it("classifySeriesRenameForBookList: search structural", () => {
    const searchCtx: BookListContext = {
      kind: "book-list",
      key: "search:foo",
      source: "search",
      sort: "addedDesc",
      query: "foo",
    };
    expect(classifySeriesRenameForBookList(searchCtx)).toBe("structural");
  });

  it("classifySeriesRenameForBookList: catalog/tag-detail/author-detail/shelf-* patchable", () => {
    const catalog: BookListContext = {
      kind: "book-list",
      key: "/catalog",
      source: "catalog",
      sort: "addedDesc",
    };
    const tagDetail: BookListContext = {
      kind: "book-list",
      key: "/tags/3",
      source: "tag-detail",
      tagId: 3,
      sort: "titleAsc",
    };
    const authorDetailCtx: BookListContext = {
      kind: "book-list",
      key: "/authors/7",
      source: "author-detail",
      authorId: 7,
      sort: "addedDesc",
    };
    const shelfRegular: BookListContext = {
      kind: "book-list",
      key: "/shelves/5",
      source: "shelf-regular",
      shelfId: 5,
      sort: "addedDesc",
    };
    const shelfBest: BookListContext = {
      kind: "book-list",
      key: "/shelves/best",
      source: "shelf-best",
      sort: "ratingDesc",
    };
    const shelfReadingNow: BookListContext = {
      kind: "book-list",
      key: "/shelves/reading-now",
      source: "shelf-reading-now",
      sort: "lastReadDesc",
    };
    expect(classifySeriesRenameForBookList(catalog)).toBe("patchable");
    expect(classifySeriesRenameForBookList(tagDetail)).toBe("patchable");
    expect(classifySeriesRenameForBookList(authorDetailCtx)).toBe("patchable");
    expect(classifySeriesRenameForBookList(shelfRegular)).toBe("patchable");
    expect(classifySeriesRenameForBookList(shelfBest)).toBe("patchable");
    expect(classifySeriesRenameForBookList(shelfReadingNow)).toBe("patchable");
  });

  it("treats rating as structural for rating-sorted lists and best shelf", () => {
    expect(classifyBookUpdateForBookList({ ...catalogAdded, sort: "ratingDesc" }, ["rating"])).toBe("structural");
    expect(classifyBookUpdateForBookList(bestShelf, ["rating"])).toBe("structural");
    expect(classifyBookUpdateForBookList(catalogAdded, ["rating"])).toBe("patchable");
  });

  it("treats shelf membership as structural only for the affected shelf context", () => {
    expect(classifyShelfMembershipForContext({ source: "shelf-regular", shelfId: 3 }, { shelfId: 3 })).toBe("structural");
    expect(classifyShelfMembershipForContext({ source: "shelf-regular", shelfId: 4 }, { shelfId: 3 })).toBe("unaffected");
    expect(classifyShelfMembershipForContext({ source: "catalog" }, { shelfId: 3 })).toBe("unaffected");
  });

  it("keeps unrelated entity-detail scroll valid for membership edits", () => {
    expect(classifyBookUpdateForBookList(authorDetail, ["authors"], { authorIds: [8] })).toBe("patchable");
    expect(classifyBookUpdateForBookList(authorDetail, ["authors"], { authorIds: [3] })).toBe("structural");
    expect(classifyBookUpdateForBookList(seriesDetail, ["series"], { seriesId: 9 })).toBe("patchable");
  });

  it("treats reading progress as structural for reading-now only", () => {
    expect(classifyReadingProgressForContext(readingNow, { hasPositionChanged: true, lastReadAtChanged: false })).toBe("structural");
    expect(classifyReadingProgressForContext(catalogAdded, { hasPositionChanged: true, lastReadAtChanged: true })).toBe("unaffected");
  });
});
