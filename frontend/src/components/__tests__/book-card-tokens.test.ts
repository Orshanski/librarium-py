import { describe, expect, it } from "vitest";
import {
  pickBorder,
  pickOpacity,
  SERIES_RAIL_BORDER_ACCENT,
  SERIES_RAIL_BORDER_PLACEHOLDER,
  SERIES_RAIL_OPACITY_ACTIVE,
  SERIES_RAIL_OPACITY_INACTIVE,
} from "../book-card-tokens";

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
