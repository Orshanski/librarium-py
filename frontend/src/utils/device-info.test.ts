import { describe, it, expect } from "vitest";
import { getDeviceName, getDeviceType } from "./device-info";

describe("getDeviceName", () => {
  it("detects iPhone", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(getDeviceName(ua)).toBe("iPhone");
  });

  it("detects iPad", () => {
    const ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(getDeviceName(ua)).toBe("iPad");
  });

  it("detects Android phone", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";
    expect(getDeviceName(ua)).toBe("Pixel 8");
  });

  it("detects Android tablet", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; SM-X810) AppleWebKit/537.36";
    expect(getDeviceName(ua)).toBe("SM-X810");
  });

  it("detects Chrome on macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(getDeviceName(ua)).toBe("Chrome on macOS");
  });

  it("detects Firefox on Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(getDeviceName(ua)).toBe("Firefox on Windows");
  });

  it("detects Safari on macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(getDeviceName(ua)).toBe("Safari on macOS");
  });

  it("falls back to Browser", () => {
    expect(getDeviceName("")).toBe("Browser");
  });
});

describe("getDeviceType", () => {
  it("returns mobile for narrow screen", () => {
    expect(getDeviceType(750)).toBe("mobile");
  });

  it("returns tablet for medium screen", () => {
    expect(getDeviceType(1024)).toBe("tablet");
  });

  it("returns desktop for wide screen", () => {
    expect(getDeviceType(1440)).toBe("desktop");
  });
});
