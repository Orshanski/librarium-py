/**
 * @fileoverview JSDOM-only helper для тестов под mobile-вёрстку librarium-py.
 *
 * Зачем нужен:
 * - `setup-jsdom.ts` устанавливает `globalThis.matchMedia` через прямое
 *   присваивание, не через `vi.stubGlobal` — поэтому `vi.unstubAllGlobals()`
 *   не восстанавливает его, а снесёт. Помощник сохраняет оригинал в
 *   module-level `originalMatchMedia` при импорте и восстанавливает явно в
 *   `teardownViewport()`.
 * - Тесты могут стартовать в desktop-режиме, mount'ить ResponsiveProvider
 *   на этом stub'е, потом эмулировать переход в mobile через
 *   `triggerMatchMediaChangeToMobile()` — listener в ResponsiveProvider при этом
 *   зарегистрирован на нашем stub'е, не на оригинальном.
 *
 * Инварианты (нарушать нельзя):
 * - Helper нельзя импортировать из самого `setup-jsdom.ts` или другого
 *   setup-file'а: `originalMatchMedia` читается на module-level при первом
 *   импорте, и если helper загрузится ДО setup-jsdom — оригинал будет
 *   undefined. Helper следует импортировать только из тестовых файлов.
 *
 * Ограничения:
 * - JSDOM-only. В node-env `globalThis.matchMedia` undefined; импорт упадёт
 *   throw'ом (см. ниже), чтобы случайное использование не молчало.
 * - `triggerMatchMediaChangeToMobile()` — однонаправленный (desktop→mobile).
 *   Обратный переход не реализован, потому что в текущих тестах не нужен.
 * - Один `registeredListener` хранится в module-level переменной — то есть
 *   одновременно поддерживается только один `MediaQueryList`-listener.
 *   Если тест mount'ит два независимых `ResponsiveProvider` (что в текущих
 *   тестах не случается), trigger дёрнет только последнего.
 *
 * Сторонние side-effects (которые мы НЕ обслуживаем здесь):
 * - `MobilePageHeader` через `useEffect` ставит CSS-переменную
 *   `--page-header-height` на `document.documentElement`. На unmount компонент
 *   сам же её сбрасывает в `0px` (см. `mobile-page-header.tsx`-cleanup).
 *   `@testing-library/react` авто-cleanup между тестами размонтирует
 *   компонент, так что переменная не утекает. Helper про это не отвечает.
 * - `ResizeObserver` в jsdom заменён no-op полифиллом из `setup-jsdom.ts` —
 *   `observe` ничего не делает, `disconnect` тоже. Не блокирует.
 */
import { vi } from "vitest";
import { act } from "react";

type ChangeListener = (event: { matches: boolean }) => void;

let currentMatches = false;
let registeredListener: ChangeListener | null = null;

const originalMatchMedia: typeof globalThis.matchMedia | undefined = globalThis.matchMedia;

if (!originalMatchMedia) {
  throw new Error(
    "mobile-viewport helper imported in node-env: globalThis.matchMedia is undefined. " +
      "Use it only in tests with `// @vitest-environment jsdom`.",
  );
}

function makeMql(query: string) {
  const mql = {
    media: query,
    onchange: null as null | ChangeListener,
    addEventListener: vi.fn((_evt: string, listener: ChangeListener) => {
      registeredListener = listener;
    }),
    removeEventListener: vi.fn(() => {
      registeredListener = null;
    }),
    dispatchEvent: vi.fn(),
  };
  Object.defineProperty(mql, "matches", { get: () => currentMatches });
  return mql;
}

export function setupDesktopViewport() {
  currentMatches = false;
  Object.defineProperty(globalThis, "innerWidth", {
    value: 1024,
    configurable: true,
    writable: true,
  });
  globalThis.matchMedia = vi.fn().mockImplementation(makeMql) as unknown as typeof globalThis.matchMedia;
}

export function setupMobileViewport() {
  currentMatches = true;
  Object.defineProperty(globalThis, "innerWidth", {
    value: 400,
    configurable: true,
    writable: true,
  });
  globalThis.matchMedia = vi.fn().mockImplementation(makeMql) as unknown as typeof globalThis.matchMedia;
}

/**
 * Имитирует переход viewport'а в mobile-режим во время теста.
 * Используется для покрытия Acceptance #3 спеки (resize desktop→mobile).
 * Меняет currentMatches=true и зовёт listener, зарегистрированный
 * ResponsiveProvider'ом при mount — на том же `matchMedia`-stub'е,
 * что был в момент render (предполагается setupDesktopViewport() ДО mount).
 *
 * Вызов listener'а триггерит setState в ResponsiveProvider, поэтому
 * оборачиваем в act() — иначе React 19 / RTL выдаст warning «update
 * inside a test was not wrapped in act(...)». act() здесь обязанность
 * helper'а, не вызывающего теста — тесты не должны знать про этот
 * implementation detail.
 */
export function triggerMatchMediaChangeToMobile() {
  currentMatches = true;
  Object.defineProperty(globalThis, "innerWidth", {
    value: 400,
    configurable: true,
    writable: true,
  });
  if (registeredListener) {
    act(() => {
      registeredListener!({ matches: true });
    });
  }
}

export function teardownViewport() {
  currentMatches = false;
  Object.defineProperty(globalThis, "innerWidth", {
    value: 1024,
    configurable: true,
    writable: true,
  });
  registeredListener = null;
  if (originalMatchMedia) {
    globalThis.matchMedia = originalMatchMedia;
  }
  // Регрессионный strap: если в будущем `setup-jsdom.ts` начнёт ставить
  // matchMedia через `vi.stubGlobal`, `vi.unstubAllGlobals()` в setup-common
  // afterEach снесёт его до нашего teardown — следующий тест получит
  // undefined matchMedia и упадёт без ясной ошибки. Этот strap делает фейл явным.
  if (typeof globalThis.matchMedia !== "function") {
    throw new Error(
      "mobile-viewport.teardownViewport: globalThis.matchMedia утрачен после restore. " +
        "Проверьте, что setup-jsdom.ts по-прежнему ставит matchMedia прямым присваиванием.",
    );
  }
}
