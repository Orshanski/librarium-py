// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  setupDesktopViewport,
  setupMobileViewport,
  triggerMatchMediaChangeToMobile,
  teardownViewport,
} from "./mobile-viewport";

describe("mobile-viewport helper", () => {
  afterEach(() => teardownViewport());

  it("setupMobileViewport: matchMedia matches:true и innerWidth маленький", () => {
    setupMobileViewport();
    expect(globalThis.matchMedia("(any)").matches).toBe(true);
    expect(globalThis.innerWidth).toBe(400);
  });

  it("setupDesktopViewport: matchMedia matches:false и innerWidth большой", () => {
    setupDesktopViewport();
    expect(globalThis.matchMedia("(any)").matches).toBe(false);
    expect(globalThis.innerWidth).toBe(1024);
  });

  it("trigger: переключает matches с false на true и зовёт зарегистрированный listener", () => {
    setupDesktopViewport();
    const mql = globalThis.matchMedia("(any)");
    let received: { matches: boolean } | null = null;
    mql.addEventListener("change", (e) => {
      received = e;
    });
    expect(mql.matches).toBe(false);
    triggerMatchMediaChangeToMobile();
    expect(mql.matches).toBe(true);
    expect(received).toEqual({ matches: true });
  });

  it("teardown: восстанавливает desktop default", () => {
    setupMobileViewport();
    teardownViewport();
    expect(globalThis.innerWidth).toBe(1024);
  });

  it("двойной цикл: setupDesktop→teardown→setupMobile→teardown без drift'а matchMedia", () => {
    setupDesktopViewport();
    expect(globalThis.matchMedia("(any)").matches).toBe(false);
    teardownViewport();

    setupMobileViewport();
    expect(globalThis.matchMedia("(any)").matches).toBe(true);
    teardownViewport();

    // matchMedia вернулся к jsdom-default (setup-jsdom.ts ставит matches:false).
    expect(globalThis.matchMedia("(any)").matches).toBe(false);
  });
});
