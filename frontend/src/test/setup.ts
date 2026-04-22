import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "./msw/server";
import { installFetchCredentials } from "@/api/credentials";

// ── MSW lifecycle — always, including node-env tests ──
//
// msw/node works in both jsdom and node environments. Placing lifecycle
// hooks outside the window check means any test (including node-env unit
// tests for Infrastructure unit category) gets deterministic handler
// isolation via resetHandlers() per test.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Storage isolation — stub localStorage/sessionStorage per test ──
//
// Node 25 auto-enables `--experimental-webstorage`, which replaces jsdom's
// in-memory window.localStorage with a disk-backed native implementation
// (and emits `--localstorage-file was provided without a valid path` warnings
// when no file is configured). That native storage is shared across the
// process/workers, breaking per-test isolation and `clear()` semantics.
//
// Fix: before each test, replace both storages with a fresh in-memory fake.
// This is what production jsdom behaviour used to give us before Node 25,
// and what every test that calls `sessionStorage.clear()` in `beforeEach`
// already implicitly assumes.
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

// ── Silence expected console.warn / console.error from error-path tests ──
//
// Production code deliberately logs on handled errors (e.g. after F1
// migrations:
//   - book-edit-form applyMetadata → console.warn("Failed to apply cover…")
//   - reader-sync pushProgressToServerCAS → console.warn("Failed to push…")
//   - sidebar/ShelfPage → console.warn("Failed to create/remove shelf…")
// When tests deliberately provoke those code paths (500 responses, network
// errors, etc.), the warn output spams CI logs (GitHub Actions renders
// stderr in red — the test passes but looks alarming). Silence both streams
// here; tests that need to assert warn content use `vi.spyOn(console, …)`
// per-test, which cleanly overrides these defaults.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── jsdom-only polyfills and bootstrap ──
//
// These only make sense when `window` exists. In node environment (e.g.
// tests with `// @vitest-environment node`) `window` is undefined and the
// block is skipped naturally.
if (typeof window !== "undefined") {
  // 1) matchMedia: jsdom doesn't implement it. ResponsiveProvider reads it at
  //    mount, so without a polyfill any test using renderWithProviders crashes
  //    before assertions.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  // 2) ResizeObserver: jsdom doesn't implement it. Desktop components like
  //    PageHeader use it, so without a polyfill they crash on mount.
  if (!window.ResizeObserver) {
    class ResizeObserverPolyfill {
      observe() { /* polyfill: no-op */ }
      unobserve() { /* polyfill: no-op */ }
      disconnect() { /* polyfill: no-op */ }
    }
    window.ResizeObserver =
      ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  }

  // 3) Production bootstrap side effect from main.tsx: patches window.fetch to
  //    add credentials:"include" + X-Requested-With for POST/PUT/PATCH/DELETE.
  //    Raw fetch() in components (e.g. sidebar.tsx) relies on this. Without it
  //    tests would run with weaker CSRF/auth semantics than production.
  installFetchCredentials();

  // 4) alert / confirm — jsdom doesn't implement them; error-path tests from
  //    F1 (h53 book-edit-form, delete UX, save fail in BookEditPage, etc.)
  //    call `alert(err.message)` and flood the test log with
  //    `Not implemented: Window's alert() method` stderr noise. Provide noop
  //    stubs so the CI log stays readable. Tests that need to assert alert
  //    content use `vi.spyOn(window, "alert")` per-test — spies replace these
  //    stubs cleanly.
  window.alert = () => {};
  window.confirm = () => true;
}
