// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { makeFB2 } from "./fb2.js";

describe("foliate FB2 progress sizing", () => {
  it("does not count an image-only top-level section as base64 text", async () => {
    const bigImage = "A".repeat(120_000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Image First</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <image l:href="#front.jpg"/>
    <section><title><p>Start</p></title><p>First readable paragraph.</p></section>
  </body>
  <binary id="front.jpg" content-type="image/jpeg">${bigImage}</binary>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));

    expect(book.sections[0].charCount).toBe(0);
    expect(book.sections[0].size).toBeLessThan(1_000);
    expect(book.sections[1].size).toBeGreaterThan(book.sections[0].size);
  });
});

describe("foliate FB2 frontmatter merging", () => {
  it("scaffold: vitest + jsdom + makeFB2 ready", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Scaffold</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section><p>hello</p></section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBeGreaterThan(0);
  });

  it("merges body-level <title> + chapter <section> into one render-section", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>The Book</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>The Book</p><p>By A B</p></title>
    <section>
      <title><p>Chapter 1</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(1);
    const doc = book.sections[0].createDocument();
    const titleSection = doc.querySelector("body > section > section.title");
    expect(titleSection?.textContent).toContain("The Book");
  });
});
