// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { computeCoverFit, applyCoverFit } from "./cover-fit.js";

describe("computeCoverFit", () => {
  // Page column 400 wide, container 600 tall, margin 20 → Hcap = 560, Hfull = 600.
  const page = { columnWidth: 400, height: 600, margin: 20 };

  it("portrait that overflows width-fit is height-capped, centered symmetrically", () => {
    // 100x150 (aspect 1.5): 400 wide → 600 tall > Hcap(560) → cap to 560.
    const fit = computeCoverFit({ ...page, imgWidth: 100, imgHeight: 150 });
    expect(fit).toEqual({ width: Math.round(560 / 1.5), height: 560, marginTop: 20 });
  });

  it("landscape fits by width, centered vertically", () => {
    // 200x100 (aspect 0.5): 400 wide → 200 tall ≤ Hcap → keep width.
    const fit = computeCoverFit({ ...page, imgWidth: 200, imgHeight: 100 });
    expect(fit).toEqual({ width: 400, height: 200, marginTop: 200 });
  });

  it("centers by full container height, not the capped band", () => {
    // square 100x100: 400 wide → 400 tall ≤ 560 → keep; marginTop = (600-400)/2 = 100.
    expect(computeCoverFit({ ...page, imgWidth: 100, imgHeight: 100 }))
      .toEqual({ width: 400, height: 400, marginTop: 100 });
    // tall cover hitting the cap (100x200, aspect 2): 800 > 560 → cap 560; marginTop = margin (20).
    const tall = computeCoverFit({ ...page, imgWidth: 100, imgHeight: 200 });
    expect(tall.height).toBe(560);
    expect(tall.marginTop).toBe(20);
  });

  it("returns null on degenerate input", () => {
    expect(computeCoverFit({ ...page, imgWidth: 0, imgHeight: 150 })).toBeNull();
    expect(computeCoverFit({ columnWidth: 0, height: 600, margin: 20, imgWidth: 100, imgHeight: 150 })).toBeNull();
    expect(computeCoverFit({ columnWidth: 400, height: undefined, margin: 20, imgWidth: 100, imgHeight: 150 })).toBeNull();
  });
});

describe("applyCoverFit", () => {
  const layout = { columnWidth: 400, height: 600, margin: 20 };
  const makeDoc = (inner: string) =>
    new DOMParser().parseFromString(`<html><body>${inner}</body></html>`, "text/html");

  it("sizes the cover-page image from page layout (dims via attrs)", () => {
    const doc = makeDoc(`<section class="cover-page"><img width="100" height="100"/></section>`);
    applyCoverFit(doc, layout);
    const img = doc.querySelector("img")!;
    expect(img.style.width).toBe("400px");
    expect(img.style.height).toBe("400px");
    expect(img.style.marginTop).toBe("100px");
  });

  it("sizes a bare cover image (native-EPUB shape: no .cover-page)", () => {
    const doc = makeDoc(`<img width="200" height="100"/>`);
    applyCoverFit(doc, layout);
    const img = doc.querySelector("img")!;
    expect(img.style.width).toBe("400px");
    expect(img.style.height).toBe("200px");
    expect(img.style.marginTop).toBe("200px");
  });

  it("does nothing when there is no image (text title page)", () => {
    const doc = makeDoc(`<section class="cover-page"><h1>Title</h1></section>`);
    expect(() => applyCoverFit(doc, layout)).not.toThrow();
  });

  it("does nothing when dims are unknown (defers; no style set yet)", () => {
    const doc = makeDoc(`<section class="cover-page"><img/></section>`);
    applyCoverFit(doc, layout);
    expect(doc.querySelector("img")!.style.width).toBe("");
  });
});
