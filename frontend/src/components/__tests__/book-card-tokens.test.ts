import { describe, expect, it } from "vitest";
import {
  bookToBookCardCommonProps,
  pickBorder,
  pickOpacity,
  SERIES_RAIL_BORDER_ACCENT,
  SERIES_RAIL_BORDER_PLACEHOLDER,
  SERIES_RAIL_OPACITY_ACTIVE,
  SERIES_RAIL_OPACITY_INACTIVE,
} from "../book-card-tokens";
import type { Book } from "../../types";

const book: Book = {
  id: 7,
  title: "Book",
  authors: [{ id: 1, name: "Author" }],
  series: null,
  seriesNumber: null,
  rating: null,
  isRead: false,
  coverPath: "/cover",
  tags: [],
};

describe("pickOpacity", () => {
  it("returns active opacity for the current book", () => {
    expect(pickOpacity(true)).toBe(SERIES_RAIL_OPACITY_ACTIVE);
  });

  it("returns inactive opacity for a non-current book", () => {
    expect(pickOpacity(false)).toBe(SERIES_RAIL_OPACITY_INACTIVE);
  });
});

describe("pickBorder", () => {
  it("returns accent border for the current book", () => {
    expect(pickBorder(true)).toBe(SERIES_RAIL_BORDER_ACCENT);
  });

  it("returns placeholder border for a non-current book", () => {
    expect(pickBorder(false)).toBe(SERIES_RAIL_BORDER_PLACEHOLDER);
  });
});

describe("bookToBookCardCommonProps", () => {
  it("marks read books as muted", () => {
    expect(bookToBookCardCommonProps({ ...book, isRead: true }).muted).toBe(true);
  });

  it("does not mute unread books", () => {
    expect(bookToBookCardCommonProps(book).muted).toBe(false);
  });
});
