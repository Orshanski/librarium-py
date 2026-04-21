// Unit tests for the buildQueryParams helper (jrx.18)
import { describe, it, expect } from "vitest";
import { buildQueryParams } from "./smart-filter-bar";
import type { SelectedFilters } from "./smart-filter-bar";
import type { ApiFilterParams } from "../api/filter-params";

describe("buildQueryParams", () => {
  it("no selected, no baseFilters → empty object", () => {
    const params = buildQueryParams("authorIds", {});
    expect(Object.keys(params)).toHaveLength(0);
  });

  it("selected has authorIds, building for 'authorIds' → own dimension excluded", () => {
    const selected: SelectedFilters = { authorIds: ["1", "2"] };
    const params = buildQueryParams("authorIds", selected);
    expect(params.authorIds).toBeUndefined();
  });

  it("selected has authorIds AND tagIds, building for 'authorIds' → includes tagIds but not authorIds", () => {
    const selected: SelectedFilters = { authorIds: ["10"], tagIds: ["99"] };
    const params = buildQueryParams("authorIds", selected);
    expect(params.authorIds).toBeUndefined();
    expect((params.tagIds as string[])[0]).toBe("99");
  });

  it("baseFilters provided → always included regardless of dimension being built", () => {
    const baseFilters: ApiFilterParams = { authorIds: ["5"], language: ["ru"] };
    const params = buildQueryParams("authorIds", {}, baseFilters);
    // baseFilters.authorIds is included even though building for 'authorIds'
    expect(params.authorIds).not.toBeUndefined();
    expect((params.authorIds as string[])[0]).toBe("5");
    expect(params.language?.[0]).toBe("ru");
  });

  it("baseFilters + selected overlap → merged (deduped via Set)", () => {
    const baseFilters: ApiFilterParams = { tagIds: ["1", "2"] };
    const selected: SelectedFilters = { tagIds: ["2", "3"] };
    const params = buildQueryParams("authorIds", selected, baseFilters);
    const tagIds = params.tagIds as string[];
    // Should contain 1, 2, 3 — deduped
    expect(tagIds).toContain("1");
    expect(tagIds).toContain("2");
    expect(tagIds).toContain("3");
    // No duplicates
    expect(tagIds.length).toBe(3);
  });

  it("baseFilters.language is array → merged correctly", () => {
    const baseFilters: ApiFilterParams = { language: ["ru"] };
    const params = buildQueryParams("authorIds", {}, baseFilters);
    expect(params.language?.[0]).toBe("ru");
  });

  it("union: selected authorIds + baseFilters authorIds → both present (building for tagIds)", () => {
    const params = buildQueryParams("tagIds", { authorIds: ["1"] }, { authorIds: ["2"] });
    const authorIds = params.authorIds as string[];
    expect(authorIds).toContain("1");
    expect(authorIds).toContain("2");
  });

  it("invariant: baseFilters[ownKey] is preserved when selected is empty", () => {
    const params = buildQueryParams("authorIds", {}, { authorIds: ["5"] });
    expect(params.authorIds).toEqual(["5"]);
  });
});
