import { describe, expect, it } from "vitest";
import { deriveBookChangedFields } from "../book-changes";

describe("deriveBookChangedFields", () => {
  it("maps scalar book edit fields to domain changed fields", () => {
    expect(deriveBookChangedFields({
      title: "New",
      description: "Text",
      publisher: "Pub",
      pubDate: "2026-01-01",
    })).toEqual([
      "title",
      "description",
      "publisher",
      "pubDate",
    ]);
  });

  it("maps relation, cover, format, and identifier changes", () => {
    expect(deriveBookChangedFields({
      authorIds: [1],
      seriesId: 2,
      seriesNumber: "3",
      tagIds: [4],
      language: "en",
      commitCover: true,
      addFormats: [{ path: "/library/uploads/book.epub" }],
      deleteFormats: [9],
      isbn: "9780000000000",
    })).toEqual([
      "authors",
      "series",
      "seriesNumber",
      "tags",
      "language",
      "coverPath",
      "files",
      "identifiers",
    ]);
  });

  it("treats null as an explicit clearing change", () => {
    expect(deriveBookChangedFields({
      publisher: null,
      seriesId: null,
      seriesNumber: null,
      isbn: null,
    })).toEqual([
      "publisher",
      "series",
      "seriesNumber",
      "identifiers",
    ]);
  });
});
