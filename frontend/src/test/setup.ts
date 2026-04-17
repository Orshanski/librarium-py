import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server";
import { installFetchCredentials } from "@/api";

// ── jsdom polyfills ──
//
// 1) matchMedia: jsdom doesn't implement it. ResponsiveProvider reads it at
//    mount, so without a polyfill any test using renderWithProviders crashes
//    before assertions.
if (typeof window !== "undefined" && !window.matchMedia) {
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

// 2) Production bootstrap side effect from main.tsx: patches window.fetch to
//    add credentials:"include" + X-Requested-With for POST/PUT/PATCH/DELETE.
//    Raw fetch() in components (e.g. sidebar.tsx) relies on this. Without it
//    tests would run with weaker CSRF/auth semantics than production.
installFetchCredentials();

// ── MSW lifecycle ──
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
