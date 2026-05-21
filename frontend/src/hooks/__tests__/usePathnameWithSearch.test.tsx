// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { usePathnameWithSearch } from "../usePathnameWithSearch";

function wrapperFor(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("usePathnameWithSearch", () => {
  it("возвращает pathname без поискового хвоста, когда search отсутствует", () => {
    const { result } = renderHook(() => usePathnameWithSearch(), {
      wrapper: wrapperFor(["/series/42"]),
    });
    expect(result.current).toBe("/series/42");
  });

  it("включает search-часть, когда она есть", () => {
    const { result } = renderHook(() => usePathnameWithSearch(), {
      wrapper: wrapperFor(["/catalog?sort=titleAsc"]),
    });
    expect(result.current).toBe("/catalog?sort=titleAsc");
  });

  it("стабилен по референсу на повторных рендерах при том же URL", () => {
    const { result, rerender } = renderHook(() => usePathnameWithSearch(), {
      wrapper: wrapperFor(["/authors/7"]),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
