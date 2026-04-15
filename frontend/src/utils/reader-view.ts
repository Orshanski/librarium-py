import type { RefObject } from "react";
import type { ReaderViewElement } from "../types/reader";

export function getFoliateView(containerRef: RefObject<HTMLDivElement | null>): ReaderViewElement | null {
  return containerRef.current?.querySelector("foliate-view") as ReaderViewElement | null;
}

export async function goToReaderHref(
  containerRef: RefObject<HTMLDivElement | null>,
  href: string,
  onPersistFallback?: (cfi: string, fraction: number) => void,
): Promise<void> {
  const view = getFoliateView(containerRef);
  if (!view) return;
  if (view.performNavigation) {
    await view.performNavigation({ type: "goTo", target: href });
    return;
  }
  await view.goTo(href);
  const loc = view.lastLocation;
  if (loc?.cfi) onPersistFallback?.(loc.cfi, loc.fraction ?? 0);
}
