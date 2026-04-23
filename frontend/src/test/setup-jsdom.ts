// jsdom-only setup: polyfills для API, которых jsdom не реализует,
// и bootstrap-side-effects из main.tsx для production-like fetch-semantics.
//
// Загружается только в projects.jsdom vitest-конфига — в node-env не импортируется,
// поэтому никаких `typeof window` guard'ов не нужно.

import { vi } from "vitest";
import { installFetchCredentials } from "@/api/credentials";

// 1) matchMedia: jsdom не реализует. ResponsiveProvider читает при mount,
//    без полифилла любой тест с renderWithProviders падает до assertion'ов.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
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

// 2) ResizeObserver: jsdom не реализует. Desktop-компоненты вроде PageHeader
//    его используют — без полифилла падают на mount.
if (!globalThis.ResizeObserver) {
  class ResizeObserverPolyfill {
    observe() { /* polyfill: no-op */ }
    unobserve() { /* polyfill: no-op */ }
    disconnect() { /* polyfill: no-op */ }
  }
  globalThis.ResizeObserver =
    ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

// 3) Production bootstrap из main.tsx: патчит globalThis.fetch, добавляет
//    credentials:"include" + X-Requested-With на POST/PUT/PATCH/DELETE. Raw
//    fetch() в компонентах (sidebar и т.п.) полагается на это — без патча
//    тесты идут с более слабой CSRF/auth-семантикой, чем prod.
installFetchCredentials();

// 4) alert / confirm: jsdom не реализует, error-path тесты их дёргают и
//    засоряют лог "Not implemented: Window's alert() method". Noop-стабы
//    успокаивают лог; тесты, которые ассертят content, используют vi.spyOn
//    per-test (spy чисто перезаписывает эти stub'ы).
globalThis.alert = () => {};
globalThis.confirm = () => true;

// 5) scrollIntoView: jsdom не реализует. Desktop-toolbar, mobile-filter-bar и
//    другие компоненты его дёргают при открытии TOC/dropdown. No-op stub.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => { /* polyfill: no-op */ };
}
