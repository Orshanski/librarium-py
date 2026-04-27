import { describe, it, expect } from "vitest";
import {
  DESKTOP_BOOK_GRID,
  MOBILE_BOOK_GRID,
  DESKTOP_BOOK_RAIL,
  MOBILE_BOOK_RAIL,
} from "../book-layout-tokens";

describe("book-layout-tokens", () => {
  it("DESKTOP_BOOK_GRID matches existing desktop grid CSS values", () => {
    expect(DESKTOP_BOOK_GRID).toEqual({ columns: "repeat(auto-fill, 150px)", gap: 24 });
  });

  it("MOBILE_BOOK_GRID matches existing mobile grid CSS values", () => {
    expect(MOBILE_BOOK_GRID).toEqual({
      columns: "repeat(3, minmax(0, 1fr))",
      gap: 12,
      alignItems: "start",
    });
  });

  it("DESKTOP_BOOK_RAIL matches existing desktop rail CSS values", () => {
    expect(DESKTOP_BOOK_RAIL).toEqual({ itemWidth: "150px", gap: 24 });
  });

  it("MOBILE_BOOK_RAIL matches existing mobile rail CSS values", () => {
    expect(MOBILE_BOOK_RAIL).toEqual({ itemWidth: "calc((100% - 24px) / 3)", gap: 12 });
  });
});
