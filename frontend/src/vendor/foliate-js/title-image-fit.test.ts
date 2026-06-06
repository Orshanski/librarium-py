// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { isImageInTitleKeepTogether } from "./title-image-fit.js";

describe("isImageInTitleKeepTogether", () => {
  const imgIn = (inner: string) => {
    const doc = new DOMParser().parseFromString(`<body>${inner}</body>`, "text/html");
    return doc.querySelector("img")!;
  };
  it("true: картинка в keep-together с заголовком (голый img)", () => {
    const img = imgIn(`<div class="keep-together"><header class="title">T</header><img src="x"/></div>`);
    expect(isImageInTitleKeepTogether(img)).toBe(true);
  });
  it("true: картинка-в-абзаце внутри keep-together с заголовком", () => {
    const img = imgIn(`<div class="keep-together"><header class="title">T</header><p><img src="x"/></p></div>`);
    expect(isImageInTitleKeepTogether(img)).toBe(true);
  });
  it("false: keep-together без заголовка (cite/poem tail)", () => {
    const img = imgIn(`<div class="keep-together"><p><img src="x"/></p></div>`);
    expect(isImageInTitleKeepTogether(img)).toBe(false);
  });
  it("false: картинка вне keep-together", () => {
    const img = imgIn(`<section><img src="x"/></section>`);
    expect(isImageInTitleKeepTogether(img)).toBe(false);
  });
  it("false: вырожденный вход (null)", () => {
    expect(isImageInTitleKeepTogether(null)).toBe(false);
  });
});
