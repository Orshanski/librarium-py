// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { prepareCoverDocument } from "./view.js";

describe("prepareCoverDocument", () => {
  it("preserves EPUB SVG cover aspect ratio", () => {
    const doc = new DOMParser().parseFromString(`
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>
          <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 600 900" preserveAspectRatio="none">
            <image width="600" height="900" href="cover.jpeg"/>
          </svg>
        </body>
      </html>
    `, "application/xhtml+xml");

    prepareCoverDocument(doc);

    expect(doc.querySelector("svg")?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("can reserve the left page so cover content starts on the right page", () => {
    const doc = new DOMParser().parseFromString(`
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body><div id="cover">Cover</div></body>
      </html>
    `, "application/xhtml+xml");

    prepareCoverDocument(doc, { placeRight: true });

    const spacer = doc.body.firstElementChild as HTMLElement;
    expect(spacer.className).toBe("foliate-cover-left-spacer");
    expect(spacer.style.breakAfter).toBe("column");
    expect(spacer.nextElementSibling?.id).toBe("cover");
  });
});
