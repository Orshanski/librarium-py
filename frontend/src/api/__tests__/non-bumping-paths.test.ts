import { describe, expect, it } from "vitest";
import { shouldSkipScrollBump } from "../non-bumping-paths";

describe("shouldSkipScrollBump", () => {
  it.each([
    ["POST", "/api/auth/login"],
    ["POST", "/api/auth/logout"],
    ["PUT", "/api/auth/profile"],
    ["POST", "/api/admin/users"],
    ["DELETE", "/api/admin/settings/foo"],
    ["PUT", "/api/reader/progress/42"],
    ["PUT", "/api/reader/settings"],
    ["DELETE", "/api/uploads/abc-123"],
    ["POST", "/api/books/42/cover"],
    ["DELETE", "/api/books/42/cover"],
  ] as const)("%s %s — skip (whitelist)", (method, path) => {
    expect(shouldSkipScrollBump(method, path)).toBe(true);
  });

  it.each([
    ["PUT", "/api/books/42"],
    ["DELETE", "/api/books/42"],
    ["PUT", "/api/books/42/cover"], // commitCover — не в whitelist для PUT
    ["PUT", "/api/books/42/cover/extra"],
    ["POST", "/api/books/42/files"],
    ["DELETE", "/api/books/42/files"],
    ["POST", "/api/books/42/add-format"],
    ["PUT", "/api/books/42/rating"],
    ["PUT", "/api/books/42/read"],
    ["PUT", "/api/authors/1"],
    ["POST", "/api/authors/1/merge"],
    ["DELETE", "/api/authors/1"],
    ["PUT", "/api/series/1"],
    ["POST", "/api/series/1/merge"],
    ["DELETE", "/api/series/1"],
    ["POST", "/api/shelves"],
    ["DELETE", "/api/shelves/7"],
    ["POST", "/api/shelves/7/books"],
    ["DELETE", "/api/shelves/7/books/42"],
    ["PUT", "/api/tags/1/map"],
    ["POST", "/api/books/create"],
    ["POST", "/api/uploads/abc-123/commit"],
    ["POST", "/api/uploads/abc-123"],
  ] as const)("%s %s — bump scroll-counter", (method, path) => {
    expect(shouldSkipScrollBump(method, path)).toBe(false);
  });
});
