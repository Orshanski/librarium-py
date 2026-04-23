import { describe, it, expect } from "vitest";
import { getDeviceName, getDeviceType } from "./device-info";

describe("getDeviceName", () => {
  it.each([
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"],
    ["Pixel 8", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"],
    ["SM-X810", "Mozilla/5.0 (Linux; Android 14; SM-X810) AppleWebKit/537.36"],
    ["Chrome on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
    ["Firefox on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"],
    ["Safari on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"],
    ["Browser", ""],
  ])("returns %s", (expected, ua) => {
    expect(getDeviceName(ua)).toBe(expected);
  });
});

describe("getDeviceType", () => {
  it.each([
    ["mobile", 750],
    ["tablet", 1024],
    ["desktop", 1440],
  ])("returns %s for width %i", (expected, width) => {
    expect(getDeviceType(width)).toBe(expected);
  });

  it("defaults to globalThis.innerWidth when no arg passed", () => {
    const original = globalThis.innerWidth;
    // jsdom default width is 1024 (tablet) — override to assert fallback path
    Object.defineProperty(globalThis, "innerWidth", { value: 1500, configurable: true });
    try {
      expect(getDeviceType()).toBe("desktop");
    } finally {
      Object.defineProperty(globalThis, "innerWidth", { value: original, configurable: true });
    }
  });
});
