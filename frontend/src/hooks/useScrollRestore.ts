import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getCacheVersion } from "../utils/cache-invalidation";

const STACK_KEY = "librarium_scroll_state";

export type ScrollStackEntry = { url: string; scrollTop: number; version: number };

function readStack(): ScrollStackEntry[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not array");
    for (const e of parsed) {
      if (
        typeof e !== "object" ||
        e === null ||
        typeof (e as ScrollStackEntry).url !== "string" ||
        typeof (e as ScrollStackEntry).scrollTop !== "number" ||
        typeof (e as ScrollStackEntry).version !== "number"
      ) {
        throw new Error("bad entry");
      }
    }
    return parsed as ScrollStackEntry[];
  } catch {
    sessionStorage.removeItem(STACK_KEY);
    return [];
  }
}

function writeStack(stack: ScrollStackEntry[]): void {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

function findMain(): HTMLElement | null {
  return document.querySelector("main");
}

export function useScrollRestore(ready: boolean): void {
  const location = useLocation();
  const url = location.pathname + location.search;
  const hasRestored = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

  // Unified layout-эффект: синхронный сброс hasRestored при смене url, затем обновление стека
  // и применение scrollTop в одной фазе.
  //
  // Семантика смены домена выражена через location.state:
  // - state === null → стек замещается одной записью. Это: sidebar-клик, reload, прямой URL,
  //   filter-change / sort-change (все updateParams на страницах-списках вызывают navigate
  //   без state — это желаемое поведение: новый фильтр = новый view, scroll сбрасывается).
  // - state !== null (crumb {crumb:true}, BookCard linkState, edit/save state.origin) → push/trim.
  useLayoutEffect(() => {
    if (lastUrlRef.current !== url) {
      hasRestored.current = false;
      lastUrlRef.current = url;
    }

    // Семантика: location.state === null означает "переход без контекста" —
    // sidebar-клик, прямой URL, reload. В этом случае стек ОБНУЛЯЕТСЯ:
    // это смена домена, старая цепочка больше не нужна. Навигации с state
    // (crumb, BookCard linkState, state-origin переходы) остаются в цепочке.
    const stack = readStack();
    let target: number;
    if (location.state === null) {
      writeStack([{ url, scrollTop: 0, version: getCacheVersion() }]);
      target = 0;
    } else {
      const idx = stack.findIndex((e) => e.url === url);
      if (idx >= 0) {
        // Trim only если реально отрезаем хвост.
        if (idx < stack.length - 1) {
          writeStack(stack.slice(0, idx + 1));
        }
        target = stack[idx].scrollTop;
      } else {
        writeStack([...stack, { url, scrollTop: 0, version: getCacheVersion() }]);
        target = 0;
      }
    }

    if (hasRestored.current) return;
    if (!ready) return;

    const latest = readStack();
    const top = latest[latest.length - 1];
    if (!top || top.version !== getCacheVersion()) {
      hasRestored.current = true;
      return;
    }

    hasRestored.current = true;
    const main = findMain();
    if (main) main.scrollTop = target;
  }, [url, ready]);

  // 3. Click-save в <main> через event-делегирование в capture-фазе.
  useEffect(() => {
    const main = findMain();
    if (!main) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-breadcrumb='true']")) return;
      const stack = readStack();
      if (stack.length === 0) return;
      const mainEl = findMain();
      if (!mainEl) return;
      stack[stack.length - 1] = {
        ...stack[stack.length - 1],
        scrollTop: mainEl.scrollTop,
        version: getCacheVersion(),
      };
      writeStack(stack);
    };

    main.addEventListener("click", handler, true);
    return () => main.removeEventListener("click", handler, true);
  }, []);
}
