// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { SectionProgress } from "./progress.js";

describe("SectionProgress cover sections", () => {
  it("excludes counted=false cover section from total fraction and locations", () => {
    const progress = new SectionProgress([
      { size: 10_000, linear: undefined, counted: false, isCover: true },
      { size: 1_500, linear: undefined },
      { size: 1_500, linear: undefined },
    ], 1500, 1600);

    expect(progress.getProgress(0, 0, 0)).toMatchObject({
      fraction: 0,
      isCover: true,
      location: { current: 0, next: 0, total: 2 },
    });
    expect(progress.getProgress(1, 0, 0)).toMatchObject({
      fraction: 0,
      isCover: false,
      location: { current: 0, total: 2 },
    });
    expect(progress.getProgress(2, 1, 0).fraction).toBe(1);
  });

  it("maps fraction zero to first counted text section, not the cover", () => {
    const progress = new SectionProgress([
      { size: 0, linear: undefined, counted: false, isCover: true },
      { size: 1_500, linear: undefined },
    ], 1500, 1600);

    expect(progress.getSection(0)).toEqual([1, 0]);
  });

  it("treats cover and frontmatter as opening block before counted text", () => {
    const progress = new SectionProgress([
      { size: 0, linear: undefined, counted: false, isCover: true },
      { size: 1_000, linear: undefined, counted: false, isOpening: true },
      { size: 1_500, linear: undefined },
    ], 1500, 1600);

    expect(progress.getProgress(1, 0, 0)).toMatchObject({
      fraction: 0,
      isCover: false,
      isOpening: true,
      section: { current: 0, total: 1 },
    });
    expect(progress.getProgress(2, 0, 0)).toMatchObject({
      fraction: 0,
      isOpening: false,
      section: { current: 1, total: 1 },
    });
    expect(progress.getSection(0)).toEqual([2, 0]);
  });

  it("does not treat every non-counted section as opening", () => {
    const progress = new SectionProgress([
      { size: 1_500, linear: undefined },
      { size: 1_000, linear: undefined, counted: false },
    ], 1500, 1600);

    expect(progress.getProgress(1, 0, 0)).toMatchObject({
      fraction: 1,
      isCover: false,
      isOpening: false,
      section: { current: 1, total: 1 },
    });
  });
});
