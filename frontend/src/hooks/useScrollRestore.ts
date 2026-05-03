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

type StackUpdate = {
  stack: ScrollStackEntry[];
  target: number;
  shouldWrite: boolean;
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

function createCurrentEntry(url: string, context?: ScrollContext): ScrollStackEntry {
  return { url, scrollTop: 0, context, version: STACK_ENTRY_VERSION };
}

function isHistoryReturn(navigationType: string, stack: ScrollStackEntry[], url: string): boolean {
  return hasSeenRouterNavigation && navigationType === "POP" && stack.some((e) => e.url === url);
}

function replaceStackWithCurrent(url: string, context?: ScrollContext): StackUpdate {
  return {
    stack: [createCurrentEntry(url, context)],
    target: 0,
    shouldWrite: true,
  };
}

function reuseExistingStackEntry(stack: ScrollStackEntry[], idx: number, context?: ScrollContext): StackUpdate {
  const nextStack = stack.slice(0, idx + 1);
  if (context) {
    nextStack[idx] = { ...nextStack[idx], context };
  }

  return {
    stack: nextStack,
    target: stack[idx].scrollTop,
    shouldWrite: idx < stack.length - 1 || Boolean(context),
  };
}

function appendCurrentStackEntry(stack: ScrollStackEntry[], url: string, context?: ScrollContext): StackUpdate {
  return {
    stack: [...stack, createCurrentEntry(url, context)],
    target: 0,
    shouldWrite: true,
  };
}

function calculateStackUpdate(
  stack: ScrollStackEntry[],
  url: string,
  context: ScrollContext | undefined,
  state: unknown,
  navigationType: string,
): StackUpdate {
  if (state === null && !isHistoryReturn(navigationType, stack, url)) {
    return replaceStackWithCurrent(url, context);
  }

  const idx = stack.findIndex((e) => e.url === url);
  if (idx >= 0) {
    return reuseExistingStackEntry(stack, idx, context);
  }

  return appendCurrentStackEntry(stack, url, context);
}

function saveCurrentScroll(url: string, context?: ScrollContext): void {
  const stack = readStack();
  const mainEl = findMain();
  const currentIndex = stack.length - 1;
  const current = stack[currentIndex];
  if (current?.url !== url || !mainEl) return;

  stack[currentIndex] = {
    ...current,
    scrollTop: mainEl.scrollTop,
    context,
    version: STACK_ENTRY_VERSION,
  };
  writeStack(stack);
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
    const update = calculateStackUpdate(readStack(), url, context, location.state, navigationType);
    if (update.shouldWrite) writeStack(update.stack);

    if (hasRestored.current) return;
    if (!ready) return;

    hasRestored.current = true;
    hasSeenRouterNavigation = true;
    const main = findMain();
    if (main) main.scrollTop = update.target;
  }, [url, ready, context, navigationType]);

  // 3. Click-save в <main> через event-делегирование в capture-фазе.
  useEffect(() => {
    const main = findMain();
    if (!main) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-breadcrumb='true']")) return;
      saveCurrentScroll(url, context);
    };

    main.addEventListener("click", handler, true);
    return () => main.removeEventListener("click", handler, true);
  }, [context, url]);
}
