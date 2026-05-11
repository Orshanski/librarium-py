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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false });
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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false, charCount: 0, size: 0 });
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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false, cfi: "__cover__" });
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
    expect(book.sections[1].isCover).not.toBe(true);
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
