// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { resolveDesktopZone, estimateCharsPerPage } from "./reader-input";
import type { DesktopTapZones, ReaderSettings } from "../components/reader-toolbar";

// Inline test fixture — avoids importing DEFAULT_DESKTOP_TAP_ZONES which
// transitively pulls in desktop-reader-toolbar (module-scope matchMedia).
const zones: DesktopTapZones = {
  topLeft: "prev", topCenter: "next", topRight: "next",
  bottomLeft: "prev", bottomCenter: "prev", bottomRight: "next",
};

describe("resolveDesktopZone", () => {
  it("top-left zone", () => {
    expect(resolveDesktopZone(0.1, 0.2, zones)).toBe(zones.topLeft);
  });

  it("bottom-left zone", () => {
    expect(resolveDesktopZone(0.1, 0.7, zones)).toBe(zones.bottomLeft);
  });

  it("top-right zone", () => {
    expect(resolveDesktopZone(0.8, 0.2, zones)).toBe(zones.topRight);
  });

  it("bottom-right zone", () => {
    expect(resolveDesktopZone(0.8, 0.7, zones)).toBe(zones.bottomRight);
  });

  it("top-center zone", () => {
    expect(resolveDesktopZone(0.5, 0.1, zones)).toBe(zones.topCenter);
  });

  it("bottom-center zone", () => {
    expect(resolveDesktopZone(0.5, 0.8, zones)).toBe(zones.bottomCenter);
  });

  it("center = toolbar", () => {
    expect(resolveDesktopZone(0.5, 0.5, zones)).toBe("toolbar");
  });
});

describe("estimateCharsPerPage", () => {
  it("returns at least 50", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => {} }),
    });
    const settings = { fontSize: 16, lineSpacing: 1.5 } as ReaderSettings;
    expect(estimateCharsPerPage(container, settings)).toBeGreaterThanOrEqual(50);
  });

  it("returns reasonable value for normal dimensions", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });
    const settings = { fontSize: 16, lineSpacing: 1.5 } as ReaderSettings;
    const result = estimateCharsPerPage(container, settings);
    expect(result).toBeGreaterThan(100);
    expect(result).toBeLessThan(10000);
  });
});
