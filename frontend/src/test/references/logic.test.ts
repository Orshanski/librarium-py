// @vitest-environment node
//
// Reference: pure logic unit.
//
// Runs in node (no DOM / no jsdom cost). `pluralizeBooks` is a pure
// function — takes a number, returns a string; no DOM, no I/O, no
// globals. This is exactly the shape the TESTING.md policy calls
// "logic unit": тестируй поведение чистой функции, всё.
import { describe, it, expect } from "vitest";
import { pluralizeBooks } from "@/utils/pluralize";

describe("reference: pure logic unit", () => {
  it("picks the correct Russian plural form", () => {
    expect(pluralizeBooks(1)).toBe("1 книга");
    expect(pluralizeBooks(2)).toBe("2 книги");
    expect(pluralizeBooks(5)).toBe("5 книг");
    expect(pluralizeBooks(11)).toBe("11 книг");
    expect(pluralizeBooks(21)).toBe("21 книга");
  });
});
