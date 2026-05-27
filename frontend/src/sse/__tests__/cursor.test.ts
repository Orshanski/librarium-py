import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSseCursorStorageKey,
  readLastAppliedEventId,
  writeLastAppliedEventId,
} from "../cursor";

describe("SSE cursor storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scopes cursor keys by authenticated user", () => {
    writeLastAppliedEventId(2, 10);
    writeLastAppliedEventId(3, 20);

    expect(buildSseCursorStorageKey(2)).toBe("librarium_sse_last_applied_event_id:user:2");
    expect(buildSseCursorStorageKey(3)).toBe("librarium_sse_last_applied_event_id:user:3");
    expect(readLastAppliedEventId(2)).toBe(10);
    expect(readLastAppliedEventId(3)).toBe(20);
  });

  it("ignores malformed stored values", () => {
    const key = buildSseCursorStorageKey(2);

    for (const stored of ["not-json", "12.5", "-1", ""]) {
      localStorage.setItem(key, stored);
      expect(readLastAppliedEventId(2)).toBe(0);
    }
  });

  it("writes cursor monotonically", () => {
    writeLastAppliedEventId(2, 15);
    writeLastAppliedEventId(2, 12);
    writeLastAppliedEventId(2, 18);

    expect(readLastAppliedEventId(2)).toBe(18);
  });

  it("rejects negative/non-integer event ids without changing current cursor", () => {
    writeLastAppliedEventId(2, 15);

    writeLastAppliedEventId(2, -1);
    writeLastAppliedEventId(2, 12.5);
    writeLastAppliedEventId(2, Number.NaN);

    expect(readLastAppliedEventId(2)).toBe(15);
  });

  it("returns 0 when storage is inaccessible", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(readLastAppliedEventId(2)).toBe(0);
  });
});
