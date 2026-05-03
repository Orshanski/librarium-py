import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import type { ScrollContext } from "@/domain/read-models";

const STACK_KEY = "librarium_scroll_state";
const STACK_ENTRY_VERSION = 0;
let hasSeenRouterNavigation = false;

export function __resetScrollRestoreForTests(): void {
  hasSeenRouterNavigation = false;
}

export type ScrollStackEntry = {
  url: string;
  scrollTop: number;
  context?: ScrollContext;
  version: number;
};

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

export function useScrollRestore(ready: boolean, context?: ScrollContext): void {
  const location = useLocation();
  const navigationType = useNavigationType();
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
    const isHistoryReturn = hasSeenRouterNavigation && navigationType === "POP" && stack.some((e) => e.url === url);
    if (location.state === null && !isHistoryReturn) {
      writeStack([{ url, scrollTop: 0, context, version: STACK_ENTRY_VERSION }]);
      target = 0;
    } else {
      const idx = stack.findIndex((e) => e.url === url);
      if (idx >= 0) {
        const nextStack = stack.slice(0, idx + 1);
        if (context) {
          nextStack[idx] = { ...nextStack[idx], context };
        }
        // Trim only если реально отрезаем хвост.
        if (idx < stack.length - 1 || context) {
          writeStack(nextStack);
        }
        target = stack[idx].scrollTop;
      } else {
        writeStack([...stack, { url, scrollTop: 0, context, version: STACK_ENTRY_VERSION }]);
        target = 0;
      }
    }

    if (hasRestored.current) return;
    if (!ready) return;

    hasRestored.current = true;
    hasSeenRouterNavigation = true;
    const main = findMain();
    if (main) main.scrollTop = target;
  }, [url, ready, context, navigationType]);

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
      if (stack[stack.length - 1].url !== url) return;
      const mainEl = findMain();
      if (!mainEl) return;
      stack[stack.length - 1] = {
        ...stack[stack.length - 1],
        scrollTop: mainEl.scrollTop,
        context,
        version: STACK_ENTRY_VERSION,
      };
      writeStack(stack);
    };

    main.addEventListener("click", handler, true);
    return () => main.removeEventListener("click", handler, true);
  }, [context, url]);
}
