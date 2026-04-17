// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/utils/sanitize-html";

describe("reference: pure logic unit", () => {
  it("strips event handlers", () => {
    expect(sanitizeHtml('<p onclick="x">a</p>')).toBe("<p>a</p>");
  });
});
