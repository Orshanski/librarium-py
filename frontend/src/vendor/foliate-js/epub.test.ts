// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { EPUB } from "./epub.js";

type SpineItem = string | { id: string; linear?: string };

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
}: {
  guideCoverHref?: string;
  coverImageHref?: string;
  spine: SpineItem[];
  files: Record<string, string>;
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
  <spine>${spineXml}</spine>
  ${guideXml}
</package>`],
  ]);
  for (const [href, content] of Object.entries(files)) {
    const path = `OEBPS/${href}`;
    allFiles.set(path, href.endsWith(".xhtml") ? content : new Blob([content], { type: "image/jpeg" }));
  }

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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false, size: 0, charCount: 0 });
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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false });
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

    expect(book.sections[0]).toMatchObject({ id: "OEBPS/titlepage.xhtml", isCover: true, counted: false });
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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false, cfi: "__cover__" });
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

    expect(book.sections[0]).toMatchObject({ isCover: true, counted: false, cfi: "__cover__" });
  });
});
