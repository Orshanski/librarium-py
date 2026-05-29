// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { makeFB2 } from "./fb2.js";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import * as CFI from "./epubcfi.js";

const flattenToc = (items: Array<{ href: string; subitems?: unknown[] | null }> | null | undefined): Array<{ href: string }> =>
  items?.flatMap(item => [
    item,
    ...flattenToc(item.subitems as Array<{ href: string; subitems?: unknown[] | null }> | null | undefined),
  ]) ?? [];

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

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false });
    expect(book.sections[1].charCount).toBe(0);
    expect(book.sections[1].size).toBeLessThan(1_000);
    expect(book.sections[2].size).toBeGreaterThan(book.sections[1].size);
  });
});

describe("foliate FB2 cover zero page", () => {
  it("prepends metadata coverpage as non-counted cover section", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Covered FB2</book-title>
      <coverpage><image l:href="#cover.jpg"/></coverpage>
    </title-info>
  </description>
  <body>
    <section><title><p>Chapter 1</p></title><p>${"А".repeat(2000)}</p></section>
  </body>
  <binary id="cover.jpg" content-type="image/jpeg">AAAA</binary>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false, charCount: 0, size: 0 });
    const coverDoc = book.sections[0].createDocument();
    expect(coverDoc.querySelector("img")?.getAttribute("src")).toContain("data:image/jpeg;base64,");
    expect(book.sections[1].isCover).not.toBe(true);
  });

  it("adds a first TOC item that navigates to cover without dropping text TOC", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>T</book-title><coverpage><image l:href="#cover.jpg"/></coverpage></title-info></description>
  <body><section><title><p>Chapter 1</p></title><p>${"А".repeat(2000)}</p></section></body>
  <binary id="cover.jpg" content-type="image/jpeg">AAAA</binary>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));

    expect(book.toc[0]).toEqual({ label: "Обложка", href: "__cover__" });
    expect(book.resolveHref("__cover__")).toEqual({ index: 0 });
    const chapter = book.toc.find((item: { label: string }) => item.label === "Chapter 1");
    expect(chapter).toBeTruthy();
    expect(book.resolveHref(chapter.href).index).toBeGreaterThan(0);
  });

  it("creates a fallback cover section when FB2 has no cover image", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>No Image</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Chapter 1</p></title><p>${"А".repeat(2000)}</p></section></body>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const coverDoc = book.sections[0].createDocument();

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false, cfi: "__cover__" });
    expect(coverDoc.body.textContent).toContain("No Image");
    expect(book.getCover()).toBeNull();
  });

  it("keeps old fake CFI text positions compatible after cover insertion", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>T</book-title><coverpage><image l:href="#cover.jpg"/></coverpage></title-info></description>
  <body><section><title><p>Chapter 1</p></title><p>${"А".repeat(2000)}</p></section></body>
  <binary id="cover.jpg" content-type="image/jpeg">AAAA</binary>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const oldTextCfi = CFI.fake.fromIndex(0);

    expect(oldTextCfi).toBeTruthy();
    expect(book.resolveCFI(oldTextCfi).index).toBe(1);
  });

  it("keeps old FB2 TOC/frontmatter behavior semantically after cover insertion", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>TOC Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>TOC Test</p></title>
    <section><p>© 2024</p></section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const textItems = flattenToc(book.toc).filter(item => item.href !== "__cover__");

    expect(book.sections[0]).toMatchObject({ isCover: true });
    expect(book.sections[1]).toMatchObject({ isCover: undefined, isOpening: true, counted: false });
    expect(textItems.length).toBeGreaterThan(0);
    for (const item of textItems) {
      expect(book.resolveHref(item.href).index).toBeGreaterThan(1);
    }
  });

  it("does not route whole-book frontmatter TOC entries to cover", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Whole Book Wrapper</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Whole Book Wrapper</p></title>
      <section><title><p>Chapter 1</p></title><p>${"А".repeat(100_000)}</p></section>
      <section><title><p>Chapter 2</p></title><p>${"Б".repeat(100_000)}</p></section>
    </section>
  </body>
</FictionBook>`;

    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const textItems = flattenToc(book.toc).filter(item => item.href !== "__cover__");

    expect(book.sections[0]).toMatchObject({ isCover: true });
    expect(textItems.length).toBeGreaterThan(0);
    for (const item of textItems) {
      expect(book.resolveHref(item.href).index).toBeGreaterThan(0);
    }
  });
});

describe("foliate FB2 frontmatter merging", () => {
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
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    expect(frontDoc.querySelector("body > section.frontmatter")).not.toBeNull();
    const titleSection = frontDoc.querySelector("section.frontmatter > section.title");
    expect(titleSection?.textContent).toContain("The Book");
    const chapterDoc = book.sections[2].createDocument();
    expect(chapterDoc.body.textContent).not.toContain("The Book");
  });

  it("merges title + <p>-style copyright into chapter (Sanderson pattern)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Test Book</book-title>
      <author><first-name>X</first-name><last-name>Y</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Test Book</p></title>
    <section>
      <p>© 2024 Author. All rights reserved.</p>
      <p>Published by SomePublisher.</p>
    </section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>${"А".repeat(2000)}</p>
      <p>Chapter content begins here.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    expect(frontDoc.body.textContent).toContain("Test Book");
    expect(frontDoc.body.textContent).toContain("All rights reserved");
    const chapterDoc = book.sections[2].createDocument();
    expect(chapterDoc.body.textContent).toContain("Chapter content begins here");
    expect(chapterDoc.body.textContent).not.toContain("Test Book");
  });

  it("merges title + <cite>-style copyright into chapter (Korsakov pattern)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Korsakov Test</book-title>
      <author><first-name>I</first-name><last-name>E</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Korsakov Test</p></title>
    <section>
      <cite>
        <p>© Author, 2026</p>
        <p>© Publisher, 2026</p>
      </cite>
    </section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>${"А".repeat(2000)}</p>
      <p>The chapter starts.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    expect(frontDoc.body.textContent).toContain("Korsakov Test");
    expect(frontDoc.body.textContent).toContain("© Author, 2026");
    const chapterDoc = book.sections[2].createDocument();
    expect(chapterDoc.body.textContent).toContain("The chapter starts");
    expect(chapterDoc.body.textContent).not.toContain("Korsakov Test");
  });

  it("preserves bare top-level <image> through merge (M1 fix)", async () => {
    const tinyImage = "AAAA";
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Image In Frontmatter</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Image In Frontmatter</p></title>
    <image l:href="#illustration.jpg"/>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
  <binary id="illustration.jpg" content-type="image/jpeg">${tinyImage}</binary>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    const img = frontDoc.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("data:image/jpeg;base64,");
  });

  it("handles empty top-level <section/> without TypeError (kn. 941, 942)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Empty First</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section/>
    <title><p>Empty First</p></title>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
  });

  it("stops Pass A at content-section with >=1500 chars prose", async () => {
    const longProse = "А".repeat(2000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Bound Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Bound Test</p></title>
    <section><p>© 2024</p></section>
    <section>
      <title><p>Long Foreword</p></title>
      <p>${longProse}</p>
    </section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>Story begins.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(4);
  });

  it("does not swallow part-header containing nested chapters with prose (B-1)", async () => {
    const bulkProse = "Б".repeat(200_000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Part I Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Part I</p><p>The Beginning</p></title>
      <section>
        <title><p>Chapter 1</p></title>
        <p>${bulkProse}</p>
      </section>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(2);
    const doc = book.sections[1].createDocument();
    expect(doc.body.textContent).toContain("Part I");
    expect(doc.body.textContent).toContain("Chapter 1");
  });

  it("merges part-header (title + image) with first chapter via Pass B (Korsakov 930 pattern)", async () => {
    const tinyImage = "AAAA";
    const bulkProse = "В".repeat(200_000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Korsakov</book-title>
      <author><first-name>I</first-name><last-name>E</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Part I</p><p>The Case</p></title>
      <image l:href="#map.jpg"/>
      <section>
        <title><p>Chapter I</p></title>
        <p>${bulkProse}</p>
      </section>
    </section>
  </body>
  <binary id="map.jpg" content-type="image/jpeg">${tinyImage}</binary>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(2);
    const doc = book.sections[1].createDocument();
    const map = doc.querySelector("img");
    expect(map).not.toBeNull();
    expect(doc.body.textContent).toContain("Part I");
    expect(doc.body.textContent).toContain("Chapter I");
  });

  it("merges single-poem top-level item before content-item via Pass A", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Poem First</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <poem>
        <stanza>
          <v>First line of poem</v>
          <v>Second line of poem</v>
        </stanza>
      </poem>
    </section>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
      <p>Story marker.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    expect(frontDoc.body.textContent).toContain("First line of poem");
    const chapterDoc = book.sections[2].createDocument();
    expect(chapterDoc.body.textContent).toContain("Story marker");
  });

  it("does NOT merge single-poem item between content-items (status quo with main)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Poem Between</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Foreword</p></title>
      <p>${"Г".repeat(2000)}</p>
    </section>
    <section>
      <poem>
        <stanza>
          <v>Lonely poem in the middle</v>
        </stanza>
      </poem>
    </section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>Story.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(4);
  });

  it("does NOT swallow content top-level item with nested prose >=1500 chars", async () => {
    const longReview = "Д".repeat(2000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Praise Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Praise Test</p></title>
    <section>
      <title><p>What people say</p></title>
      <section><p>${longReview}</p></section>
    </section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>Story.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(4);
  });

  it("does NOT merge tail-segment of part I with head-segment of part II (M3)", async () => {
    const bulk1 = "Е".repeat(200_000);
    const bulk2 = "Ж".repeat(200_000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Two Parts</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>PARTONE</p></title>
      <section>
        <title><p>Chapter 1</p></title>
        <p>${bulk1}</p>
      </section>
    </section>
    <section>
      <title><p>PARTTWO</p></title>
      <section>
        <title><p>Chapter 2</p></title>
        <p>${bulk2}</p>
      </section>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const doc1 = book.sections[1].createDocument();
    const doc2 = book.sections[2].createDocument();
    expect(doc1.body.textContent).toContain("PARTONE");
    expect(doc1.body.textContent).not.toContain("PARTTWO");
    expect(doc2.body.textContent).toContain("PARTTWO");
    expect(doc2.body.textContent).not.toContain("PARTONE");
  });

  it("leaves second <body name='notes'> untouched", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>With Notes</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>With Notes</p></title>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
      <p>Main text<a l:href="#note1" type="note">[1]</a> here.</p>
    </section>
  </body>
  <body name="notes">
    <section id="note1">
      <title><p>Note 1</p></title>
      <p>Footnote text.</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(4);
    expect(book.sections[3].linear).toBe("no");
  });

  it("preserves all items when whole book is decorative", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Photo Album</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Photo Album</p></title>
    <section><cite><p>© 2024</p></cite></section>
    <section><epigraph><p>A quote.</p></epigraph></section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(4);
  });

  it("regression guard: heading-only chapter intro still merges with prose segment", async () => {
    const bulk = "З".repeat(200_000);
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Regression Guard</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Chapter Title</p></title>
      <section>
        <title><p>Sub 1</p></title>
        <p>${bulk}</p>
      </section>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(2);
    const doc = book.sections[1].createDocument();
    expect(doc.body.textContent).toContain("Chapter Title");
    expect(doc.body.textContent).toContain("Sub 1");
  });

  it("preserves preamble order in DOM after Pass A merge (B-2 fix)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Order Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>ITEM_A</p></title>
    <section><p>ITEM_B</p></section>
    <section><cite><p>ITEM_C</p></cite></section>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
      <p>ITEM_TARGET</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const frontDoc = book.sections[1].createDocument();
    const frontText = frontDoc.body.textContent ?? "";
    const idxA = frontText.indexOf("ITEM_A");
    const idxB = frontText.indexOf("ITEM_B");
    const idxC = frontText.indexOf("ITEM_C");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA);
    expect(idxC).toBeGreaterThan(idxB);
    expect(frontText).not.toContain("ITEM_TARGET");
    const chapterDoc = book.sections[2].createDocument();
    expect(chapterDoc.body.textContent).toContain("ITEM_TARGET");
  });

  it("preserves wrapper id through Pass A clone (M2 fix)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Anchor Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <section id="copyright_section"><p>© 2024</p></section>
    <section>
      <title><p>Chapter</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    expect(book.sections.length).toBe(3);
    const resolved = book.resolveHref("#copyright_section");
    expect(resolved.index).toBe(1);
    const doc = book.sections[1].createDocument();
    expect(resolved.anchor(doc)).not.toBeNull();
  });

  it("splits a large multi-section chapter into multiple render-sections at the section boundary", async () => {
    const big = "Я".repeat(200_000); // > MAX_CHARS (180000), forces splitSection
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>Split Test</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body>
    <section>
      <title><p>Big Part</p></title>
      <section><title><p>Sub A</p></title><p>${big}</p></section>
      <section><title><p>Sub B</p></title><p>${big}</p></section>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    // A >MAX_CHARS chapter with nested sub-sections splits into multiple render
    // sections (cover + the split sub-sections). Contrast with the small-chapter
    // test below, which stays a single render-section: the pair pins the split
    // boundary. Asserting the section count (not a TOC label) keeps the test on
    // the split behaviour and avoids flattenToc's href-only return type.
    expect(book.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a small multi-section chapter as a single render-section (no split)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>Small</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body>
    <section>
      <title><p>Tiny Part</p></title>
      <section><title><p>Sub A</p></title><p>${"А".repeat(2000)}</p></section>
      <section><title><p>Sub B</p></title><p>${"Б".repeat(2000)}</p></section>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    // cover + one combined chapter render-section
    expect(book.sections.length).toBe(2);
  });

  it("preserves TOC labels and resolves them after Pass A merge", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>TOC Test</book-title>
      <author><first-name>A</first-name><last-name>B</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>TOC Test</p></title>
    <section><p>© 2024</p></section>
    <section>
      <title><p>Chapter 1</p></title>
      <p>${"А".repeat(2000)}</p>
    </section>
  </body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const labels = book.toc.map((t: { label: string }) => t.label);
    expect(labels).toContain("Chapter 1");
    const tocItem = book.toc.find((t: { label: string }) => t.label === "Chapter 1");
    expect(tocItem).toBeDefined();
    const [sectionIdx] = book.splitTOCHref(tocItem!.href);
    expect(sectionIdx).toBe(2);
  });
});

describe("foliate FB2 kfl7 typography", () => {
  it("renders text-author without a generated leading dash", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>Cite</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <cite><p>${"А".repeat(2000)}</p><text-author>Иван Петров</text-author></cite>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    const author = doc.querySelector(".text-author");
    expect(author?.textContent).toBe("Иван Петров");
  });

  it("renders nested section titles as capped heading levels", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>H</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>L1</p></title><p>${"А".repeat(2000)}</p>
    <section><title><p>L2</p></title><p>x</p>
      <section><title><p>L3</p></title><p>y</p>
        <section><title><p>L4</p></title><p>z</p>
          <section><title><p>L5deep</p></title><p>w</p></section>
        </section>
      </section>
    </section>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    // depth caps at h4: L4 and L5deep both render as h4
    expect(doc.querySelector(".title h1")?.textContent).toContain("L1");
    expect([...doc.querySelectorAll(".title h4")].map(e => e.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("L4"), expect.stringContaining("L5deep")])
    );
  });

  it("renders epigraph (italic) and annotation (muted aside) box-free with body content", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>E</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <epigraph><p>Мотто</p><text-author>Автор</text-author></epigraph>
    <annotation><p>Редакторская заметка</p></annotation>
    <p>${"А".repeat(2000)}</p>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    expect(doc.querySelector(".epigraph p")?.textContent).toContain("Мотто");
    expect(doc.querySelector("aside.annotation")?.textContent).toContain("Редакторская заметка");
  });

  it("renders section subtitle (heading-tag) and stanza subtitle (p) with the subtitle class", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>S</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <subtitle>Сцена</subtitle>
    <poem><stanza><subtitle>Строфа-подзаголовок</subtitle><v>Строка</v></stanza></poem>
    <p>${"А".repeat(2000)}</p>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    // section subtitle is a heading tag with class subtitle; stanza subtitle is a p with class subtitle
    expect(doc.querySelector("h3.subtitle, h4.subtitle")?.textContent).toContain("Сцена");
    expect(doc.querySelector("p.subtitle")?.textContent).toContain("Строфа-подзаголовок");
  });

  it("renders verse lines as block .verse-line spans and a poem title", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>P</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <poem><title><p>Песня</p></title>
      <stanza><v>Строка один</v><v>Строка два</v></stanza>
      <text-author>Поэт</text-author><date>1227</date>
    </poem>
    <p>${"А".repeat(2000)}</p>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    const lines = [...doc.querySelectorAll(".poem .verse-line")];
    expect(lines.map(l => l.textContent)).toEqual(["Строка один", "Строка два"]);
    expect(doc.querySelector(".poem-title")?.textContent).toContain("Песня");
    expect(doc.querySelector(".poem .date")?.textContent).toContain("1227");
  });

  it("separates consecutive poems with a <br> sibling (empty-line) that the run-spacing CSS targets", async () => {
    // Regression guard: a run of separate <poem>s split by <empty-line/> (a common
    // LotR-style structure) must render as `.poem`, `<br>`, `.poem` siblings so the
    // `.poem + br` / `.poem + br + .poem` rules can collapse the separator and
    // tighten the run. (Dropping that CSS reopened huge inter-poem gaps.)
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>PR</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <poem><stanza><v>Первая строфа</v></stanza></poem>
    <empty-line/>
    <poem><stanza><v>Вторая строфа</v></stanza></poem>
    <p>${"А".repeat(2000)}</p>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    const poems = [...doc.querySelectorAll(".poem")];
    expect(poems.length).toBe(2);
    const between = poems[0].nextElementSibling;
    expect(between?.tagName.toLowerCase()).toBe("br");
    expect(between?.nextElementSibling).toBe(poems[1]);
  });

  it("renders cite as an italic blockquote with the cite class and no inline box styles", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>C</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description>
  <body><section><title><p>Ch</p></title>
    <cite><subtitle>Лейбл</subtitle><p>${"А".repeat(2000)}</p><text-author>Источник</text-author></cite>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    const cite = doc.querySelector("blockquote.cite");
    expect(cite).not.toBeNull();
    expect(cite?.querySelector(".subtitle")?.textContent).toContain("Лейбл");
    expect(cite?.querySelector(".text-author")?.textContent).toBe("Источник");
  });
});

describe("foliate FB2 multi-level divider assembly (kfl7 Phase 2)", () => {
  // A book-title section wraps a part-title section wraps a chapter. The chapter
  // carries >MAX_CHARS (180000) of prose so the book section splits, producing
  // bare-heading flush segments — the exact shape that strands as an empty page.
  const bigProse = "А".repeat(190_000);
  const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>Multi-level</book-title></title-info></description>
  <body>
    <section>
      <title><p>КНИГА ПЕРВАЯ</p></title>
      <section>
        <title><p>ЧАСТЬ 1</p></title>
        <section>
          <title><p>Глава первая</p></title>
          <p>${bigProse}</p>
        </section>
      </section>
    </section>
  </body>
</FictionBook>`;

  it("gathers book + part titles onto the chapter's render section, no empty divider", async () => {
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));

    // Find content sections (skip the cover at index 0).
    const content = (book.sections as Array<{ createDocument: () => Document }>).slice(1);
    // No content section is a titles-only divider (has titles but no paragraph text).
    for (const s of content) {
      const doc = s.createDocument();
      const proseChars = Array.from(doc.querySelectorAll("p"))
        .reduce((n: number, p) => n + (p.textContent?.length ?? 0), 0);
      const hasTitle = doc.querySelector(".title") != null;
      expect(hasTitle && proseChars === 0).toBe(false);
    }

    // The chapter's render section holds all three titles.
    const chapterSection = content.find(s => {
      const t = s.createDocument().body?.textContent ?? "";
      return t.includes("Глава первая");
    });
    expect(chapterSection).toBeTruthy();
    const chDoc = chapterSection!.createDocument();
    const titlesText = chDoc.body?.textContent ?? "";
    expect(titlesText).toContain("КНИГА ПЕРВАЯ");
    expect(titlesText).toContain("ЧАСТЬ 1");
    expect(titlesText).toContain("Глава первая");
  });

  it("resolves all three TOC entries to the same merged section", async () => {
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const flat = (items: Array<{ label: string; href: string; subitems?: unknown[] }>): Array<{ label: string; href: string }> =>
      items?.flatMap(i => [i, ...flat((i.subitems as typeof items) ?? [])]) ?? [];
    const all = flat(book.toc);
    const find = (needle: string) => all.find(i => i.label.includes(needle));
    const kniga = find("КНИГА ПЕРВАЯ");
    const chast = find("ЧАСТЬ 1");
    const glava = find("Глава первая");
    expect(kniga && chast && glava).toBeTruthy();
    const idx = (i: { href: string }) => book.resolveHref(i.href).index;
    expect(idx(kniga!)).toBe(idx(glava!));
    expect(idx(chast!)).toBe(idx(glava!));
  });

  it("lays the gathered titles out as flat sibling .title headers (not nested sections)", async () => {
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    const chapterSection = (book.sections as Array<{ createDocument: () => Document }>).slice(1).find(s =>
      (s.createDocument().body?.textContent ?? "").includes("Глава первая"));
    const root = chapterSection!.createDocument().body!.querySelector("section") ?? chapterSection!.createDocument().body!;
    const leadingTitles: string[] = [];
    // After the keep-together grouping pass the leading title run is inside a
    // .keep-together wrapper box as the first child; look through it.
    const firstChild = root.children[0];
    const titleContainer =
      firstChild?.classList.contains("keep-together") ? firstChild : root;
    for (const child of Array.from(titleContainer.children)) {
      if (child.classList.contains("title")) leadingTitles.push(child.textContent?.replace(/\s+/g, " ").trim() ?? "");
      else break;
    }
    // All three opening titles are consecutive .title siblings before any prose.
    expect(leadingTitles.length).toBe(3);
    expect(leadingTitles.join(" | ")).toContain("КНИГА ПЕРВАЯ");
    expect(leadingTitles.join(" | ")).toContain("ЧАСТЬ 1");
    expect(leadingTitles.join(" | ")).toContain("Глава первая");
  });

  // Acceptance pin (spec: "a foreword-bearing book divider keeps its own spread").
  // A divider that carries its own prose (≥ PROSE_BUDGET 1500) is NOT thin, so it
  // is NOT gathered forward. This is a regression guard — green on current code too;
  // it pins that the unwrap change does not start swallowing prose-bearing dividers.
  it("leaves a foreword-bearing divider as its own render section (not gathered)", async () => {
    const foreword = "Ф".repeat(1600);          // ≥ 1500 → hasProseContent → not thin
    const chapterProse = "А".repeat(190_000);   // > MAX_CHARS → forces the split
    const fwFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>FW</book-title></title-info></description>
  <body><section><title><p>ТОМ С ПРЕДИСЛОВИЕМ</p></title><p>${foreword}</p>
    <section><title><p>Глава первая</p></title><p>${chapterProse}</p></section>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([fwFb2], { type: "application/x-fictionbook+xml" }));
    const content = (book.sections as Array<{ createDocument: () => Document }>).slice(1);
    const fwSection = content.find(s =>
      (s.createDocument().body?.textContent ?? "").includes("ТОМ С ПРЕДИСЛОВИЕМ"));
    expect(fwSection).toBeTruthy();
    const fwText = fwSection!.createDocument().body?.textContent ?? "";
    expect(fwText).toContain("ТОМ С ПРЕДИСЛОВИЕМ");
    // The foreword divider keeps its own spread — the chapter is a separate section.
    expect(fwText.includes("Глава первая")).toBe(false);
  });

  // Acceptance pin (spec edge: a divider whose only non-title content is decorative
  // front matter — an epigraph, no prose — is still thin and gathers forward, the
  // epigraph travelling with it). Multi-level so it also exercises the unwrap fix.
  it("gathers a multi-level divider that carries an epigraph, the epigraph travelling with it", async () => {
    const chapterProse = "А".repeat(190_000);
    const epFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>EP</book-title></title-info></description>
  <body><section><title><p>КНИГА С ЭПИГРАФОМ</p></title><epigraph><p>эпиграф книги</p></epigraph>
    <section><title><p>ЧАСТЬ 1</p></title>
      <section><title><p>Глава первая</p></title><p>${chapterProse}</p></section>
    </section>
  </section></body>
</FictionBook>`;
    const book = await makeFB2(new Blob([epFb2], { type: "application/x-fictionbook+xml" }));
    const content = (book.sections as Array<{ createDocument: () => Document }>).slice(1);
    // No content section is a prose-less divider (opening present, no NON-decorative prose).
    for (const s of content) {
      const doc = s.createDocument();
      const prose = Array.from(doc.querySelectorAll("p"))
        .filter(p => !p.closest(".epigraph, .annotation, .cite, .poem"))
        .reduce((n: number, p) => n + (p.textContent?.length ?? 0), 0);
      const hasOpening = doc.querySelector(".title") != null;
      expect(hasOpening && prose === 0).toBe(false);
    }
    const chapter = content.find(s =>
      (s.createDocument().body?.textContent ?? "").includes("Глава первая"));
    const chText = chapter!.createDocument().body?.textContent ?? "";
    expect(chText).toContain("КНИГА С ЭПИГРАФОМ");
    expect(chText).toContain("эпиграф книги");
    expect(chText).toContain("ЧАСТЬ 1");
  });

  it("wraps the section opening (title run + first block) in a break-inside keep-together box", async () => {
    const book = await makeFB2(new Blob([
      `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>S</book-title></title-info></description>
  <body><section><title><p>Глава</p></title><p>Первый абзац главы.</p><p>Второй.</p></section></body>
</FictionBook>`,
    ], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[1].createDocument();
    const keep = doc.querySelector(".keep-together");
    expect(keep).toBeTruthy();
    // The opening box holds the title and the first content block, in order.
    expect(keep!.querySelector(".title")).toBeTruthy();
    expect(keep!.textContent).toContain("Первый абзац главы");
    // It does NOT swallow the rest of the chapter.
    expect(keep!.textContent).not.toContain("Второй.");
    // It never wraps a nested <section>.
    expect(keep!.querySelector("section")).toBeNull();
  });

  it("keeps a cite's opening label (.subtitle) with its first body line", async () => {
    const book = await makeFB2(new Blob([
      `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>S</book-title></title-info></description>
  <body><section><title><p>Гл</p></title><p>текст до</p>
    <cite><subtitle>Лейбл цитаты</subtitle><p>Первая строка цитаты.</p><p>Вторая строка.</p><text-author>Источник</text-author></cite>
  </section></body>
</FictionBook>`,
    ], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[book.sections.length - 1].createDocument();
    const cite = doc.querySelector("blockquote.cite")!;
    // The opening label and the first body line share one keep-together box.
    const labelBox = (Array.from(cite.querySelectorAll(".keep-together")) as Element[])
      .find((k: Element) => k.querySelector(".subtitle"));
    expect(labelBox).toBeTruthy();
    expect(labelBox!.textContent).toContain("Лейбл цитаты");
    expect(labelBox!.textContent).toContain("Первая строка цитаты");
    // It does not swallow the second body line.
    expect(labelBox!.textContent).not.toContain("Вторая строка");
    expect(labelBox!.querySelector("section")).toBeNull();
  });

  it("keeps a poem's closing attribution with its last line", async () => {
    const book = await makeFB2(new Blob([
      `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>S</book-title></title-info></description>
  <body><section><title><p>Гл</p></title><p>текст</p>
    <poem><stanza><v>строка раз</v><v>строка два</v></stanza><text-author>Автор</text-author><date>1227</date></poem>
  </section></body>
</FictionBook>`,
    ], { type: "application/x-fictionbook+xml" }));
    const doc = book.sections[1].createDocument();
    const tails = (Array.from(doc.querySelectorAll(".keep-together")) as Element[])
      .filter((k: Element) => k.querySelector(".text-author") || k.querySelector(".date"));
    expect(tails.length).toBeGreaterThan(0);
    const tail = tails[0];
    // The tail box holds the last verse line plus author plus date together.
    expect(tail.textContent).toContain("строка два");
    expect(tail.textContent).toContain("Автор");
    expect(tail.textContent).toContain("1227");
    expect(tail.querySelector("section")).toBeNull();
  });

  it("keeps a TOC entry resolving correctly after grouping", async () => {
    const book = await makeFB2(new Blob([
      `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>S</book-title></title-info></description>
  <body><section><title><p>Глава</p></title><p>${"А".repeat(2000)}</p></section></body>
</FictionBook>`,
    ], { type: "application/x-fictionbook+xml" }));
    const glava = book.toc.find((i: { label: string }) => i.label.includes("Глава"));
    expect(glava).toBeTruthy();
    expect(book.resolveHref(glava.href).index).toBeGreaterThan(0);
  });
});

describe("foliate FB2 pxb2 image classification", () => {
  const make = async (bodyInner: string) => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>T</book-title></title-info></description>
  <body>${bodyInner}</body>
  <binary id="i1.png" content-type="image/png">AAAA</binary>
  <binary id="i2.png" content-type="image/png">BBBB</binary>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" }));
    return book as { sections: Array<{ createDocument: () => Document }> };
  };
  // find the first <img> across all content sections' converted docs
  const firstImg = (book: { sections: Array<{ createDocument: () => Document }> }) => {
    for (const s of book.sections) {
      const img = s.createDocument().querySelector("img");
      if (img) return img;
    }
    return null;
  };
  const allImgs = (book: { sections: Array<{ createDocument: () => Document }> }) => {
    const out: Element[] = [];
    for (const s of book.sections) out.push(...s.createDocument().querySelectorAll("img"));
    return out;
  };

  it("картинка одна в абзаце → block-image", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p><image l:href="#i1.png"/></p><p>Body.</p></section>`);
    expect(firstImg(book)?.classList.contains("block-image")).toBe(true);
  });

  it("игнорирует пробельные текст-узлы вокруг картинки → block-image", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p>\n  <image l:href="#i1.png"/>\n  </p><p>Body.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(true);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  it("картинка первая, после неё текст → float-image", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p><image l:href="#i1.png"/>Текст главы после картинки.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("float-image")).toBe(true);
    expect(img?.classList.contains("block-image")).toBe(false);
  });

  it("картинка по тексту абзаца → inline-glyph", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p>До <image l:href="#i1.png"/> после.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("inline-glyph")).toBe(true);
    expect(img?.classList.contains("float-image")).toBe(false);
  });

  it("несколько картинок в абзаце без текста → все inline-glyph (дефолт)", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p><image l:href="#i1.png"/><image l:href="#i2.png"/></p></section>`);
    const imgs = allImgs(book);
    expect(imgs.length).toBe(2);
    for (const img of imgs) {
      expect(img.classList.contains("inline-glyph")).toBe(true);
      expect(img.classList.contains("block-image")).toBe(false);
      expect(img.classList.contains("float-image")).toBe(false);
    }
  });

  it("несколько картинок + текст → первая float, остальные inline (классифицируется только первая)", async () => {
    const book = await make(`<section><title><p>Ch</p></title><p><image l:href="#i1.png"/><image l:href="#i2.png"/>Текст абзаца после картинок.</p></section>`);
    const imgs = allImgs(book);
    expect(imgs.length).toBe(2);
    expect(imgs[0].classList.contains("float-image")).toBe(true);
    expect(imgs[1].classList.contains("float-image")).toBe(false);
    expect(imgs[1].classList.contains("inline-glyph")).toBe(true);
  });

  it("картинку внутри cite НЕ классифицирует", async () => {
    const book = await make(`<section><title><p>Ch</p></title><cite><p><image l:href="#i1.png"/></p></cite></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(false);
    expect(img?.classList.contains("float-image")).toBe(false);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  it("картинку внутри эпиграфа НЕ классифицирует", async () => {
    const book = await make(`<section><title><p>Ch</p></title><epigraph><p><image l:href="#i1.png"/></p></epigraph><p>Body.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(false);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  it("картинку внутри поэмы НЕ классифицирует", async () => {
    const book = await make(`<section><title><p>Ch</p></title><poem><title><p><image l:href="#i1.png"/></p></title><stanza><v>x</v></stanza></poem><p>Body.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(false);
    expect(img?.classList.contains("float-image")).toBe(false);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  it("картинку внутри аннотации НЕ классифицирует", async () => {
    const book = await make(`<section><title><p>Ch</p></title><annotation><p><image l:href="#i1.png"/></p></annotation><p>Body.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(false);
    expect(img?.classList.contains("float-image")).toBe(false);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  it("section-level картинку (не в <p>) НЕ классифицирует", async () => {
    const book = await make(`<section><title><p>Ch</p></title><image l:href="#i1.png"/><p>Body.</p></section>`);
    const img = firstImg(book);
    expect(img?.classList.contains("block-image")).toBe(false);
    expect(img?.classList.contains("float-image")).toBe(false);
    expect(img?.classList.contains("inline-glyph")).toBe(false);
  });

  // Регрессия-гард (НЕ проверка логики классификатора): обложка строится отдельным путём
  // (createCoverSection), classifyImages на cover-секции не вызывается, и её img не в <p>.
  // Тест защищает от случайной классификации обложки, а не «доказывает» скип в classifyImages.
  it("обложка остаётся без класса (путь cover-секции независим от classifyImages)", async () => {
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns:l="http://www.w3.org/1999/xlink">
  <description><title-info><book-title>T</book-title><coverpage><image l:href="#cover.png"/></coverpage></title-info></description>
  <body><section><title><p>Ch</p></title><p>${"А".repeat(100)}</p></section></body>
  <binary id="cover.png" content-type="image/png">AAAA</binary>
</FictionBook>`;
    const book = await makeFB2(new Blob([fb2], { type: "application/x-fictionbook+xml" })) as { sections: Array<{ createDocument: () => Document }> };
    const coverImg = book.sections[0].createDocument().querySelector("img");
    expect(coverImg).toBeTruthy();
    expect(coverImg?.className ?? "").toBe("");
  });
});
