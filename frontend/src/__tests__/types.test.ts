import { describe, expect, it } from "vitest";
import { toBook, RawBook, AuthorRef } from "../types";

const baseRaw: RawBook = {
  id: 1,
  title: "X",
  authors: [],
  series: null,
  seriesNumber: null,
  tags: [],
  rating: null,
  language: null,
  coverPath: null,
  description: null,
  publisher: null,
  pubDate: null,
  updatedAt: null,
  isRead: null,
};

describe("toBook", () => {
  it("authors as objects → Book.authors as names", () => {
    const raw: RawBook = {
      ...baseRaw,
      id: 1,
      title: "X",
      authors: [{ id: 1, name: "A" }, { id: 2, name: "B" }] as AuthorRef[],
      updatedAt: "2020",
    };
    const b = toBook(raw);
    expect(b.authors).toEqual(["A", "B"]);
  });

  it("series object → Book.series name", () => {
    const raw: RawBook = { ...baseRaw, series: { id: 5, name: "ВК" } };
    const b = toBook(raw);
    expect(b.series).toBe("ВК");
  });

  it("series null → Book.series null", () => {
    const raw: RawBook = { ...baseRaw, series: null };
    const b = toBook(raw);
    expect(b.series).toBeNull();
  });

  it("coverPath uses updatedAt timestamp", () => {
    const raw: RawBook = { ...baseRaw, id: 7, updatedAt: "2025-01-01" };
    const b = toBook(raw);
    expect(b.coverPath).toBe("/api/covers/7?t=2025-01-01");
  });
});
