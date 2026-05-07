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
    expect(book.sections.length).toBe(1);
    const doc = book.sections[0].createDocument();
    expect(doc.body.textContent).toContain("Test Book");
    expect(doc.body.textContent).toContain("All rights reserved");
    expect(doc.body.textContent).toContain("Chapter content begins here");
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
    expect(book.sections.length).toBe(1);
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
    expect(book.sections.length).toBe(1);
    const doc = book.sections[0].createDocument();
    const img = doc.querySelector("img");
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
    expect(book.sections.length).toBe(1);
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
    expect(book.sections.length).toBe(2);
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
    expect(book.sections.length).toBe(1);
    const doc = book.sections[0].createDocument();
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
    expect(book.sections.length).toBe(1);
    const doc = book.sections[0].createDocument();
    const map = doc.querySelector("img");
    expect(map).not.toBeNull();
    expect(doc.body.textContent).toContain("Part I");
    expect(doc.body.textContent).toContain("Chapter I");
  });
});
