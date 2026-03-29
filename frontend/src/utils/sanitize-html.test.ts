// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml", () => {
  it("preserves safe HTML", () => {
    expect(sanitizeHtml("<p>Hello <b>world</b></p>")).toBe("<p>Hello <b>world</b></p>");
  });

  it("removes script tags", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe("");
  });

  it("removes event handlers", () => {
    expect(sanitizeHtml('<p onclick="alert(1)">text</p>')).toBe("<p>text</p>");
  });

  it("removes style attributes", () => {
    expect(sanitizeHtml('<p style="color:red">text</p>')).toBe("<p>text</p>");
  });

  it("blocks javascript: in href", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain("javascript:");
  });

  it("allows safe href", () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it("removes img tags (not in allowlist)", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("preserves allowed tags", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    expect(sanitizeHtml(html)).toBe(html);
  });
});
