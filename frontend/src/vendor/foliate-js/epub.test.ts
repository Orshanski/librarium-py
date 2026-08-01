// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { EPUB } from "./epub.js";

type SpineItem = string | { id: string; linear?: string };
type TocItem = { label: string; href: string };

interface EpubFixture {
  loadText: (path: string) => string | null;
  loadBlob: (path: string) => Blob | null;
  getSize: (path: string) => number;
}

const makeEPUBFromFixture = async (fixture: EpubFixture) =>
  new EPUB({
    loadText: fixture.loadText,
    loadBlob: fixture.loadBlob,
    getSize: fixture.getSize,
  }).init();

function makeMinimalEpub({
  guideCoverHref,
  coverImageHref,
  spine,
  files,
  toc,
}: {
  guideCoverHref?: string;
  coverImageHref?: string;
  spine: SpineItem[];
  files: Record<string, string>;
  toc?: TocItem[];
}): EpubFixture {
  const ids = new Set(spine.map(item => typeof item === "string" ? item : item.id));
  const manifest = new Map<string, { href: string; mediaType: string; properties?: string }>();
  for (const [href] of Object.entries(files)) {
    const id = href.replace(/\.[^.]+$/, "");
    const mediaType = href.endsWith(".xhtml")
      ? "application/xhtml+xml"
      : href.endsWith(".jpeg") || href.endsWith(".jpg")
        ? "image/jpeg"
        : "application/octet-stream";
    manifest.set(id, {
      href,
      mediaType,
      properties: coverImageHref === href ? "cover-image" : undefined,
    });
  }
  for (const id of ids) {
    if (!manifest.has(id)) {
      manifest.set(id, { href: `${id}.xhtml`, mediaType: "application/xhtml+xml" });
    }
  }
  if (toc) {
    manifest.set("ncx", { href: "toc.ncx", mediaType: "application/x-dtbncx+xml" });
  }

  const manifestXml = Array.from(manifest.entries())
    .map(([id, item]) => `<item id="${id}" href="${item.href}" media-type="${item.mediaType}"${item.properties ? ` properties="${item.properties}"` : ""}/>`)
    .join("");
  const spineXml = spine
    .map(item => {
      const id = typeof item === "string" ? item : item.id;
      const linear = typeof item === "string" || !item.linear ? "" : ` linear="${item.linear}"`;
      return `<itemref idref="${id}"${linear}/>`;
    })
    .join("");
  const guideXml = guideCoverHref
    ? `<guide><reference type="cover" title="Cover" href="${guideCoverHref}"/></guide>`
    : "";
  const tocXml = toc
    ? `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>${toc.map((item, index) => `<navPoint id="nav-${index}" playOrder="${index + 1}"><navLabel><text>${item.label}</text></navLabel><content src="${item.href}"/></navPoint>`).join("")}</navMap>
</ncx>`
    : null;
  const metaCoverXml = coverImageHref && !Array.from(manifest.values()).some(item => item.properties === "cover-image")
    ? `<meta name="cover" content="${coverImageHref.replace(/\.[^.]+$/, "")}"/>`
    : "";

  const allFiles = new Map<string, string | Blob>([
    ["META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`],
    ["OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">test-book</dc:identifier>
    <dc:title>Test EPUB</dc:title>
    ${metaCoverXml}
  </metadata>
  <manifest>${manifestXml}</manifest>
  <spine${toc ? ' toc="ncx"' : ""}>${spineXml}</spine>
  ${guideXml}
</package>`],
  ]);
  for (const [href, content] of Object.entries(files)) {
    const path = `OEBPS/${href}`;
    allFiles.set(path, href.endsWith(".xhtml") ? content : new Blob([content], { type: "image/jpeg" }));
  }
  if (tocXml) allFiles.set("OEBPS/toc.ncx", tocXml);

  return {
    loadText: path => {
      const value = allFiles.get(path);
      return typeof value === "string" ? value : null;
    },
    loadBlob: path => {
      const value = allFiles.get(path);
      if (value instanceof Blob) return value;
      return typeof value === "string" ? new Blob([value], { type: "application/xhtml+xml" }) : null;
    },
    getSize: path => {
      const value = allFiles.get(path);
      return typeof value === "string" ? value.length : (value?.size ?? 0);
    },
  };
}

const xhtml = (body: string) =>
  `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;

function makeInlineTocBook({
  inlineLinks,
  toc,
  contentBodies = {},
  inlineListHtml,
}: {
  inlineLinks: TocItem[];
  toc: TocItem[];
  contentBodies?: Record<string, string>;
  inlineListHtml?: string;
}) {
  const contentFiles = Object.fromEntries(
    [...new Set([...inlineLinks, ...toc].map(item => item.href.split("#", 1)[0]))]
      .map((href, index) => [
        href,
        xhtml(contentBodies[href] ?? `<h1>Раздел ${index + 1}</h1><p>Текст</p>`),
      ]),
  );
  const inlineList = inlineListHtml ?? inlineLinks
    .map(item => `<li><a href="${item.href}">${item.label}</a></li>`)
    .join("");
  return makeMinimalEpub({
    guideCoverHref: "titlepage.xhtml",
    spine: ["titlepage", "annotation", ...Object.keys(contentFiles).map(href => href.replace(/\.xhtml$/, ""))],
    toc,
    files: {
      "titlepage.xhtml": xhtml('<img src="cover.jpeg"/>'),
      "annotation.xhtml": xhtml(`<div><h3>Annotation</h3><p>Настоящая аннотация</p></div><hr/><ul>${inlineList}</ul><hr/>`),
      "cover.jpeg": "AAAA",
      ...contentFiles,
    },
  });
}

describe("foliate EPUB cover zero page", () => {
  it("marks guide cover spine page as non-counted cover section", async () => {
    const epub = makeMinimalEpub({
      guideCoverHref: "titlepage.xhtml",
      spine: ["titlepage", "chapter1"],
      files: {
        "titlepage.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.jpeg"/></body></html>`,
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
        "cover.jpeg": "AAAA",
      },
    });

    const book = await makeEPUBFromFixture(epub);

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false, size: 0, charCount: 0 });
    expect(book.sections[0].linear).not.toBe("no");
    expect(book.toc[0]).toEqual({ label: "Обложка", href: "__cover__" });
    expect(book.resolveHref("__cover__")).toEqual({ index: 0 });
  });

  it("keeps native cover navigable even when the spine marks it linear=no", async () => {
    const epub = makeMinimalEpub({
      guideCoverHref: "titlepage.xhtml",
      spine: [{ id: "titlepage", linear: "no" }, "chapter1"],
      files: {
        "titlepage.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.jpeg"/></body></html>`,
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
        "cover.jpeg": "AAAA",
      },
    });

    const book = await makeEPUBFromFixture(epub);

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false });
    expect(book.sections[0].linear).not.toBe("no");
  });

  it("moves a native cover spine page to zero page when it is not first", async () => {
    const epub = makeMinimalEpub({
      guideCoverHref: "titlepage.xhtml",
      spine: ["chapter1", { id: "titlepage", linear: "no" }, "chapter2"],
      files: {
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
        "titlepage.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.jpeg"/></body></html>`,
        "chapter2.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 2</h1><p>Text</p></body></html>`,
        "cover.jpeg": "AAAA",
      },
    });

    const book = await makeEPUBFromFixture(epub);

    expect(book.sections[0]).toMatchObject({ id: "OEBPS/titlepage.xhtml", isCover: true, isOpening: true, counted: false });
    expect(book.sections[0].linear).not.toBe("no");
    expect(book.sections[1].id).toBe("OEBPS/chapter1.xhtml");
    expect(book.resolveHref("__cover__")).toEqual({ index: 0 });
    expect(book.resolveHref("OEBPS/chapter1.xhtml")?.index).toBe(1);
    expect(book.resolveHref("OEBPS/chapter2.xhtml")?.index).toBe(2);
    expect(book.resolveCFI(book.sections[1].cfi).index).toBe(1);
  });

  it("prepends a synthetic cover section when cover metadata is not in the spine", async () => {
    const epub = makeMinimalEpub({
      coverImageHref: "cover.jpeg",
      spine: ["chapter1"],
      files: {
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
        "cover.jpeg": "AAAA",
      },
    });

    const book = await makeEPUBFromFixture(epub);

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false, cfi: "__cover__" });
    expect(book.sections[1].id).toBe("OEBPS/chapter1.xhtml");
    expect(book.resolveHref("OEBPS/chapter1.xhtml")?.index).toBe(1);
  });

  it("does not double-shift native EPUB CFI and shifts only synthetic-cover EPUB CFI", async () => {
    const nativeCoverBook = await makeEPUBFromFixture(makeMinimalEpub({
      guideCoverHref: "titlepage.xhtml",
      spine: ["titlepage", "chapter1"],
      files: {
        "titlepage.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.jpeg"/></body></html>`,
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
        "cover.jpeg": "AAAA",
      },
    }));
    const syntheticCoverBook = await makeEPUBFromFixture(makeMinimalEpub({
      spine: ["chapter1"],
      files: {
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
      },
    }));

    expect(nativeCoverBook.resolveCFI(nativeCoverBook.sections[1].cfi).index).toBe(1);
    expect(syntheticCoverBook.resolveCFI(syntheticCoverBook.sections[1].cfi).index).toBe(1);
  });

  it("creates fallback cover when EPUB has no cover image metadata", async () => {
    const epub = makeMinimalEpub({
      spine: ["chapter1"],
      files: {
        "chapter1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Text</p></body></html>`,
      },
    });

    const book = await makeEPUBFromFixture(epub);

    expect(book.sections[0]).toMatchObject({ isCover: true, isOpening: true, counted: false, cfi: "__cover__" });
  });
});

describe("foliate EPUB duplicate inline TOC", () => {
  it("removes an empty trailing TOC shell", async () => {
    const toc = [{ label: "Глава", href: "chapter1.xhtml" }];
    const book = await makeEPUBFromFixture(makeInlineTocBook({
      inlineLinks: [],
      toc,
      inlineListHtml: "",
    }));

    const doc = await book.sections[1].createDocument();

    expect(doc.body.textContent).toContain("Настоящая аннотация");
    expect(doc.body.querySelector(":scope > ul")).toBeNull();
    expect(doc.body.querySelectorAll(":scope > hr")).toHaveLength(0);
  });

  it("keeps a non-empty annotation list without links", async () => {
    const toc = [{ label: "Глава", href: "chapter1.xhtml" }];
    const book = await makeEPUBFromFixture(makeInlineTocBook({
      inlineLinks: [],
      toc,
      inlineListHtml: "Содержательный текст аннотации",
    }));

    const doc = await book.sections[1].createDocument();

    expect(doc.body.querySelector(":scope > ul")?.textContent).toContain("Содержательный текст аннотации");
    expect(doc.body.querySelectorAll(":scope > hr")).toHaveLength(2);
  });

  it("removes a short duplicate TOC without relying on a link-count threshold", async () => {
    const links = Array.from({ length: 2 }, (_, index) => ({
      label: `Глава ${index + 1}`,
      href: `chapter${index + 1}.xhtml#inline-${index + 1}`,
    }));
    const toc = links.map((item, index) => ({
      label: item.label,
      href: `${item.href.split("#", 1)[0]}#canonical-${index + 1}`,
    }));
    const book = await makeEPUBFromFixture(makeInlineTocBook({ inlineLinks: links, toc }));

    const doc = await book.sections[1].createDocument();

    expect(doc.body.textContent).toContain("Настоящая аннотация");
    expect(doc.body.querySelector(":scope > ul")).toBeNull();
  });

  it("removes the duplicate TOC from the document loaded into the reader iframe", async () => {
    const links = Array.from({ length: 6 }, (_, index) => ({
      label: `Глава ${index + 1}`,
      href: `chapter${index + 1}.xhtml#inline-${index + 1}`,
    }));
    const toc = links.map((item, index) => ({
      label: item.label,
      href: `${item.href.split("#", 1)[0]}#canonical-${index + 1}`,
    }));
    const book = await makeEPUBFromFixture(makeInlineTocBook({ inlineLinks: links, toc }));
    let loadedAnnotation = "";
    book.transformTarget.addEventListener("data", (event: Event) => {
      const detail = (event as CustomEvent<{ data: string; name: string }>).detail;
      if (detail.name.endsWith("annotation.xhtml")) loadedAnnotation = detail.data;
    });

    await book.sections[1].load();
    const doc = new DOMParser().parseFromString(loadedAnnotation, "application/xhtml+xml");

    expect(doc.body.textContent).toContain("Настоящая аннотация");
    expect(doc.body.querySelector(":scope > ul")).toBeNull();
  });

  it("removes a book-222-style TOC while preserving chapter links to note pages", async () => {
    const links = [
      { label: "Глава", href: "chapter1.xhtml#inline-chapter" },
      ...Array.from({ length: 5 }, (_, index) => ({
        label: `Примечание ${index + 1}`,
        href: `note${index + 1}.xhtml#n${index + 1}`,
      })),
    ];
    const toc = links.map((item, index) => ({
      label: `Канонический пункт ${index + 1}`,
      href: `${item.href.split("#", 1)[0]}#canonical-${index + 1}`,
    }));
    const book = await makeEPUBFromFixture(makeInlineTocBook({
      inlineLinks: links,
      toc,
      contentBodies: {
        "chapter1.xhtml": '<h1>Глава</h1><p>Текст<a id="back_n1" href="note1.xhtml#n1"><sup>[1]</sup></a></p>',
        "note1.xhtml": '<h1 id="n1">1</h1><div>Текст примечания</div>',
      },
    }));

    const annotationDoc = await book.sections[1].createDocument();
    const chapterSection = book.sections.find((section: { id: string }) => section.id.endsWith("chapter1.xhtml"));
    const chapterDoc = await chapterSection.createDocument();

    expect(annotationDoc.body.textContent).toContain("Настоящая аннотация");
    expect(annotationDoc.body.querySelector(":scope > ul")).toBeNull();
    expect(annotationDoc.body.querySelectorAll(":scope > hr")).toHaveLength(0);
    expect(chapterDoc.querySelector('a[href="note1.xhtml#n1"] sup')?.textContent).toBe("[1]");
    expect(book.toc.slice(1).map((item: TocItem) => item.label)).toEqual(toc.map(item => item.label));
  });

  it("removes a duplicate TOC whose many fragment links share section paths", async () => {
    const links = Array.from({ length: 6 }, (_, index) => ({
      label: `Подраздел ${index + 1}`,
      href: `chapter${Math.floor(index / 3) + 1}.xhtml#inline-${index + 1}`,
    }));
    const toc = links.map((item, index) => ({
      label: `Другой заголовок ${index + 1}`,
      href: `${item.href.split("#", 1)[0]}#canonical-${index + 1}`,
    }));
    const book = await makeEPUBFromFixture(makeInlineTocBook({ inlineLinks: links, toc }));

    const doc = await book.sections[1].createDocument();

    expect(doc.body.textContent).toContain("Настоящая аннотация");
    expect(doc.body.querySelector("ul")).toBeNull();
  });

  it("keeps an annotation list whose targets do not duplicate the canonical TOC", async () => {
    const inlineLinks = Array.from({ length: 6 }, (_, index) => ({
      label: `Связанная тема ${index + 1}`,
      href: `appendix${index + 1}.xhtml`,
    }));
    const toc = Array.from({ length: 6 }, (_, index) => ({
      label: `Глава ${index + 1}`,
      href: `chapter${index + 1}.xhtml`,
    }));
    const book = await makeEPUBFromFixture(makeInlineTocBook({ inlineLinks, toc }));

    const doc = await book.sections[1].createDocument();

    expect(doc.body.querySelector(":scope > ul")).not.toBeNull();
    expect(doc.body.querySelectorAll(":scope > hr")).toHaveLength(2);
  });
});
