// Unit tests for the buildQueryParams helper (jrx.18)
import { describe, it, expect } from "vitest";
import { buildQueryParams } from "./smart-filter-bar";
import type { SelectedFilters, ApiFilterParams } from "./smart-filter-bar";

describe("buildQueryParams", () => {
  it("no selected, no baseFilters → empty URLSearchParams", () => {
    const params = buildQueryParams("author", {});
    expect([...params.entries()]).toHaveLength(0);
  });

  it("selected has author, building for 'author' → own dimension excluded", () => {
    const selected: SelectedFilters = { author: ["1", "2"] };
    const params = buildQueryParams("author", selected);
    expect(params.has("authorIds")).toBe(false);
  });

  it("selected has author AND tag, building for 'author' → includes tagIds but not authorIds", () => {
    const selected: SelectedFilters = { author: ["10"], genre: ["99"] };
    const params = buildQueryParams("author", selected);
    expect(params.has("authorIds")).toBe(false);
    expect(params.get("tagIds")).toBe("99");
  });

  it("baseFilters provided → always included regardless of dimension being built", () => {
    const baseFilters: ApiFilterParams = { authorIds: ["5"], language: "ru" };
    const params = buildQueryParams("author", {}, baseFilters);
    // baseFilters.authorIds is included even though building for 'author'
    expect(params.get("authorIds")).toBe("5");
    expect(params.get("language")).toBe("ru");
  });

  it("baseFilters + selected overlap → merged (deduped via Set)", () => {
    const baseFilters: ApiFilterParams = { tagIds: ["1", "2"] };
    const selected: SelectedFilters = { genre: ["2", "3"] };
    const params = buildQueryParams("author", selected, baseFilters);
    const tagIds = params.get("tagIds")!.split(",");
    // Should contain 1, 2, 3 — deduped
    expect(tagIds).toContain("1");
    expect(tagIds).toContain("2");
    expect(tagIds).toContain("3");
    // No duplicates
    expect(tagIds.length).toBe(3);
  });
});
