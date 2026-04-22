import { beforeEach, describe, expect, it } from "vitest";
import { getCacheVersion, invalidateCache } from "../cache-invalidation";

describe("cache-invalidation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("getCacheVersion возвращает 0 для отсутствующего ключа", () => {
    expect(getCacheVersion()).toBe(0);
  });

  it("invalidateCache увеличивает счётчик на 1 и пишет в sessionStorage", () => {
    invalidateCache();
    expect(sessionStorage.getItem("librarium_cache_version")).toBe("1");
    expect(getCacheVersion()).toBe(1);
  });

  it("последовательные вызовы invalidateCache дают монотонно растущую последовательность", () => {
    invalidateCache();
    invalidateCache();
    invalidateCache();
    expect(getCacheVersion()).toBe(3);
  });

  it("нечисловое значение в ключе читается как 0", () => {
    sessionStorage.setItem("librarium_cache_version", "not-a-number");
    expect(getCacheVersion()).toBe(0);
  });

  it("getCacheVersion не кэширует значение в памяти модуля", () => {
    sessionStorage.setItem("librarium_cache_version", "7");
    expect(getCacheVersion()).toBe(7);
    sessionStorage.setItem("librarium_cache_version", "42");
    expect(getCacheVersion()).toBe(42);
  });
});
