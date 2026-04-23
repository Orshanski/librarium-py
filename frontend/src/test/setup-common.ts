// Env-agnostic test setup: работает и в jsdom, и в чистом node.
// Никаких обращений к window/document/localStorage напрямую.

import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "./msw/server";

// ── MSW lifecycle — работает и в jsdom, и в node через msw/node ──
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Storage isolation — стабить localStorage/sessionStorage через vi.stubGlobal ──
//
// Node 25 auto-enables `--experimental-webstorage`, которое подсовывает
// disk-backed native Storage вместо in-memory. Оно шарится между тестами
// и рушит `clear()`-семантику. Plus в чистом node-env нет Storage вообще.
// vi.stubGlobal работает в обоих режимах: подсовывает наш fake как globalThis.X.
function makeInMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key(index: number) { return Array.from(store.keys())[index] ?? null; },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    clear() { store.clear(); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeInMemoryStorage());
  vi.stubGlobal("sessionStorage", makeInMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Silence expected console.warn / console.error ──
//
// Production-код логирует на handled errors (failed-fetch и т.п.). Когда
// тесты дёргают этот path специально (500, abort), warn'ы спамят CI-лог.
// Per-test spy через vi.spyOn(console, ...) чистым переопределением снимает.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
