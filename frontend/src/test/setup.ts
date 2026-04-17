import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server";
import { installFetchCredentials } from "@/api";

// In node environment (no DOM), provide a minimal DOMPurify mock so unit
// tests like sanitizeHtml can be tested without jsdom overhead.
if (typeof window === "undefined") {
  globalThis.DOMPurify = {
    sanitize: (html: string) => html.replace(/on\w+="[^"]*"/g, ""),
  } as any;
}

// ── jsdom polyfills ──
//
// Only run in jsdom environment (not in node environment for unit tests).
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
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverPolyfill as any;
  }

  // 3) Production bootstrap side effect from main.tsx: patches window.fetch to
  //    add credentials:"include" + X-Requested-With for POST/PUT/PATCH/DELETE.
  //    Raw fetch() in components (e.g. sidebar.tsx) relies on this. Without it
  //    tests would run with weaker CSRF/auth semantics than production.
  installFetchCredentials();

  // ── MSW lifecycle ──
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
